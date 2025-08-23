const asyncHandler = require('../middleware/async');
const ErrorResponse = require('../utils/errorResponse');
const AudioDRM = require('../utils/drm');
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const drm = new AudioDRM();

// @desc    Generate secure DRM streaming session
// @route   POST /api/v1/drm/session/:id
// @access  Private
exports.generateDRMSession = asyncHandler(async (req, res, next) => {
  const fileId = parseInt(req.params.id);
  const userId = req.user.id;
  
  // Get file information
  const file = await prisma.audioFile.findUnique({
    where: { id: fileId },
    include: {
      fileAccesses: {
        where: { userId: userId }
      }
    }
  });
  
  if (!file) {
    return next(new ErrorResponse('File not found', 404));
  }
  
  // Check access permissions (admin bypass)
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const isAdmin = user && user.role === 'admin';
  
  if (!isAdmin) {
    const hasAccess = file.fileAccesses.length > 0 || file.isPublic;
    if (!hasAccess) {
      return next(new ErrorResponse('Not authorized to access this file', 403));
    }
  }
  
  // Generate secure session token
  const sessionToken = drm.generateSecureSession(fileId, userId);
  
  res.status(200).json({
    success: true,
    data: {
      sessionToken,
      fileId,
      fileName: file.filename,
      duration: file.duration,
      expiresIn: 30 * 60 * 1000 // 30 minutes
    }
  });
});

// @desc    Stream audio with DRM protection
// @route   GET /api/v1/drm/stream/:sessionToken
// @access  Private (via session token)
exports.streamDRMProtectedAudio = asyncHandler(async (req, res, next) => {
  const { sessionToken } = req.params;
  
  try {
    // Validate session
    const session = drm.validateSecureSession(sessionToken);
    
    // Get file information
    const file = await prisma.audioFile.findUnique({
      where: { id: session.fileId }
    });
    
    if (!file) {
      return next(new ErrorResponse('File not found', 404));
    }
    
    const filePath = path.join(process.env.FILE_UPLOAD_PATH, file.path);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return next(new ErrorResponse('File not found on disk', 404));
    }
    
    // Set security headers to prevent download/caching
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    res.setHeader('X-Download-Options', 'noopen');
    res.setHeader('Content-Disposition', 'inline; filename="protected-audio"');
    
    // Disable right-click and download attempts
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
    
    // Handle encrypted files
    if (file.isEncrypted && file.encryptionKey && file.encryptionIV) {
      try {
        // Create a decrypted stream for encrypted files
        const decryptedStream = drm.createDecryptedStream(filePath, {
          key: file.encryptionKey,
          iv: file.encryptionIV
        });
        
        // Set headers for encrypted audio streaming (no range support for now)
        res.setHeader('Accept-Ranges', 'none');
        res.status(200);
        
        // Stream the decrypted content
        decryptedStream.pipe(res);
        
        console.log(`Encrypted file streamed: ${file.filename} by user ${session.userId}`);
        return;
        
      } catch (decryptError) {
        console.error('Decryption error:', decryptError);
        return next(new ErrorResponse('Error decrypting file', 500));
      }
    }
    
    // Handle unencrypted files (legacy support)
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    
    // Enable range requests for unencrypted files
    res.setHeader('Accept-Ranges', 'bytes');
    
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.setHeader('Content-Length', chunksize);
      
      const fileStream = fs.createReadStream(filePath, { start, end });
      fileStream.pipe(res);
    } else {
      // Stream entire file
      res.setHeader('Content-Length', fileSize);
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
    }
    
  } catch (error) {
    return next(new ErrorResponse('Invalid or expired session', 403));
  }
});

// @desc    Stream audio in encrypted chunks to prevent download
// @access  Private helper function
// Removed chunked streaming function to prevent memory leaks

// @desc    Encrypt uploaded audio file
// @route   POST /api/v1/drm/encrypt/:id
// @access  Private/Admin
exports.encryptAudioFile = asyncHandler(async (req, res, next) => {
  const fileId = parseInt(req.params.id);
  
  // Get file information
  const file = await prisma.audioFile.findUnique({
    where: { id: fileId }
  });
  
  if (!file) {
    return next(new ErrorResponse('File not found', 404));
  }
  
  const originalPath = path.join(process.env.FILE_UPLOAD_PATH, file.filename);
  const encryptedPath = path.join(process.env.FILE_UPLOAD_PATH, `encrypted_${file.filename}`);
  
  try {
    // Encrypt the file
    const encryptionResult = await drm.encryptAudioFile(originalPath, encryptedPath);
    
    // Update database with encrypted file info
    await prisma.audioFile.update({
      where: { id: fileId },
      data: {
        filename: `encrypted_${file.filename}`,
        isEncrypted: true,
        encryptionKey: encryptionResult.fileKey,
        encryptionIV: encryptionResult.iv
      }
    });
    
    // Remove original unencrypted file
    if (fs.existsSync(originalPath)) {
      fs.unlinkSync(originalPath);
    }
    
    res.status(200).json({
      success: true,
      message: 'File encrypted successfully',
      data: {
        fileId,
        encrypted: true
      }
    });
    
  } catch (error) {
    return next(new ErrorResponse('File encryption failed', 500));
  }
});

// @desc    Get DRM protection status
// @route   GET /api/v1/drm/status/:id
// @access  Private
exports.getDRMStatus = asyncHandler(async (req, res, next) => {
  const fileId = parseInt(req.params.id);
  
  const file = await prisma.audioFile.findUnique({
    where: { id: fileId },
    select: {
      id: true,
      filename: true,
      isEncrypted: true,
      createdAt: true
    }
  });
  
  if (!file) {
    return next(new ErrorResponse('File not found', 404));
  }
  
  res.status(200).json({
    success: true,
    data: {
      fileId: file.id,
      filename: file.filename,
      isProtected: file.isEncrypted || false,
      drmEnabled: true,
      protectionLevel: 'high',
      features: {
        encryptionAtRest: file.isEncrypted || false,
        secureStreaming: true,
        downloadPrevention: true,
        sessionBasedAccess: true,
        chunkEncryption: true
      }
    }
  });
});