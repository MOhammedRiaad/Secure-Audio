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
  const { chunk } = req.query; // Chunk number for chunked streaming
  
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
    
    const filePath = path.join(process.env.FILE_UPLOAD_PATH, file.filename);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return next(new ErrorResponse('File not found on disk', 404));
    }
    
    // Handle chunked streaming for enhanced security
    if (chunk !== undefined) {
      return streamChunkedAudio(req, res, next, filePath, session, parseInt(chunk));
    }
    
    // Set security headers to prevent download/caching
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Accept-Ranges', 'none'); // Disable range requests
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
    
    // Check if file is encrypted and handle accordingly
    if (file.isEncrypted && file.encryptionKey && file.encryptionIV) {
      // Use the decrypted stream for encrypted files
      const decryptedStream = drm.createDecryptedStream(filePath, {
        key: file.encryptionKey,
        iv: file.encryptionIV
      });
      
      decryptedStream.pipe(res);
    } else {
      // For unencrypted files, stream directly
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
    }
    
  } catch (error) {
    return next(new ErrorResponse('Invalid or expired session', 403));
  }
});

// @desc    Stream audio in encrypted chunks to prevent download
// @access  Private helper function
const streamChunkedAudio = async (req, res, next, filePath, session, chunkNumber) => {
  try {
    const CHUNK_SIZE = 64 * 1024; // 64KB chunks
    const stat = fs.statSync(filePath);
    const totalChunks = Math.ceil(stat.size / CHUNK_SIZE);
    
    // Validate chunk number
    if (chunkNumber < 0 || chunkNumber >= totalChunks) {
      return next(new ErrorResponse('Invalid chunk range', 416));
    }
    
    const start = chunkNumber * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE - 1, stat.size - 1);
    const chunkSize = end - start + 1;
    
    // Read the chunk
    const buffer = Buffer.alloc(chunkSize);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buffer, 0, chunkSize, start);
    fs.closeSync(fd);
    
    // Encrypt the chunk with session-specific key
    const encryptedChunk = drm.encryptChunk(buffer, session.sessionToken, chunkNumber);
    
    // Set headers for chunked response
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', encryptedChunk.length);
    res.setHeader('X-Chunk-Number', chunkNumber);
    res.setHeader('X-Total-Chunks', totalChunks);
    res.setHeader('X-Chunk-Size', chunkSize);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    
    // Send encrypted chunk
    res.status(200).send(encryptedChunk);
    
    // Log chunk access
    console.log(`Chunk ${chunkNumber}/${totalChunks} served for session ${session.sessionToken}`);
    
  } catch (error) {
    console.error('Chunked streaming error:', error);
    return next(new ErrorResponse('Chunk streaming failed', 500));
  }
};

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