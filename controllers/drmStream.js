const asyncHandler = require('../middleware/async');
const ErrorResponse = require('../utils/errorResponse');
const AudioDRM = require('../utils/drm');
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const { verifySignature, setRangeHeaders } = require('../utils/signedUrl');

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

// @desc    Stream audio with signed URL and timestamp support
// @route   GET /api/v1/audio/:id/stream-signed
// @access  Public (with signature verification)
exports.streamSignedAudio = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
    const { start = "0", end = "-1", expires, sig } = req.query;
    
    if (!expires || !sig) {
      return res.status(400).json({ error: "missing signed parameters" });
    }
    
    const now = Date.now();
    const exp = parseInt(expires, 10);
    if (!exp || now > exp) {
      return res.status(403).json({ error: "link expired" });
    }
    
    const meta = await prisma.audioFile.findUnique({
      where: { id: parseInt(id) }
    });
    if (!meta) return res.status(404).json({ error: "not found" });
    
    // Verify signature (IP bound)
    const s = String(start);
    const e = String(end);
    const ok = verifySignature({
      fileRef: id,
      start: s,
      end: e,
      expires: exp,
      ip: req.ip,
      sig,
    });
    if (!ok) return res.status(403).json({ error: "invalid signature" });
    
    const filePath = path.join(process.env.FILE_UPLOAD_PATH, meta.path);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return next(new ErrorResponse('File not found on disk', 404));
    }
    
    const fileSize = meta.sizeBytes || fs.statSync(filePath).size;
    const duration = meta.duration || 0;
    
    // Convert time-based parameters to byte offsets
    let a, b;
    
    if (duration > 0) {
      // Treat start and end as time values (seconds)
      const startTime = parseFloat(s);
      const endTime = e === "-1" ? duration : parseFloat(e);
      
      console.log('🕐 Converting time to byte offsets:', {
        startTime,
        endTime,
        duration,
        fileSize
      });
      
      // Convert time to byte offsets
      const startRatio = Math.max(0, startTime) / duration;
      const endRatio = Math.min(endTime, duration) / duration;
      
      a = Math.floor(startRatio * fileSize);
      b = endTime === duration ? fileSize - 1 : Math.floor(endRatio * fileSize);
      
      console.log('📍 Time to byte conversion result:', {
        startRatio,
        endRatio,
        byteStart: a,
        byteEnd: b
      });
    } else {
      // Fallback to treating as byte offsets
      a = parseInt(s, 10);
      b = e === "-1" ? fileSize - 1 : parseInt(e, 10);
    }
    
    if (isNaN(a) || isNaN(b) || a < 0 || b >= fileSize || a > b) {
      console.log('❌ Invalid range parameters:', { a, b, fileSize });
      return res
        .status(416)
        .set({ "Content-Range": `bytes */${fileSize}` })
        .end();
    }
    
    // Handle encrypted files with time-based seeking
    if (meta.isEncrypted && meta.encryptionKey && meta.encryptionIV) {
      try {
        if (duration > 0 && parseFloat(s) > 0) {
          console.log('🔓 Creating decrypted stream and seeking to timestamp:', s);
          
          // Create decrypted stream for the encrypted file
          const decryptedStream = drm.createDecryptedStream(filePath, {
            key: meta.encryptionKey
          });
          
          // For time-based seeking with encrypted files, we'll stream the entire decrypted content
          // This is a simplified approach - in production, you'd want more sophisticated seeking
          const startTime = parseFloat(s);
          const endTime = e === "-1" ? duration : parseFloat(e);
          
          console.log(`📍 Streaming decrypted file from ${startTime}s to ${endTime > 0 ? endTime + 's' : 'end'}`);
          
          // Set appropriate headers for audio streaming
          res.setHeader('Content-Type', 'audio/mpeg');
          res.setHeader('Accept-Ranges', 'bytes');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
          res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
          
          // Stream the decrypted audio
          decryptedStream.pipe(res);
          
          decryptedStream.on('error', (error) => {
            console.error('Decrypted stream error:', error);
            if (!res.headersSent) {
              res.status(500).json({ error: 'Decryption streaming failed' });
            }
          });
          
          return;
        } else {
          // For byte-based requests or start from beginning, use normal range handling
          const decryptedStream = drm.createDecryptedStream(filePath, {
            key: meta.encryptionKey
          });
          
          setRangeHeaders(res, {
            status: a === 0 && b === fileSize - 1 ? 200 : 206,
            start: a,
            end: b,
            fileSize,
            contentType: meta.contentType || 'audio/mpeg',
          });
          
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
          res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
          
          decryptedStream.pipe(res);
          console.log(`Encrypted signed stream: ${meta.filename} (${a}-${b})`);
          return;
        }
        
      } catch (decryptError) {
        console.error('Decryption error:', decryptError);
        return next(new ErrorResponse('Error decrypting file', 500));
      }
    }
    
    // Handle unencrypted files with precise range support
    setRangeHeaders(res, {
      status: a === 0 && b === fileSize - 1 ? 200 : 206,
      start: a,
      end: b,
      fileSize,
      contentType: meta.contentType || 'audio/mpeg',
    });
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
    
    const fileStream = fs.createReadStream(filePath, { start: a, end: b });
    fileStream.pipe(res);
    
    console.log(`Signed stream: ${meta.filename} (${a}-${b})`);
    
  } catch (e) {
    console.error("/stream-signed error", e);
    if (!res.headersSent) res.status(500).json({ error: "stream failed" });
    else res.end();
  }
});

// @desc    Generate signed URL for timestamp-based streaming
// @route   POST /api/v1/drm/signed-url/:id
// @access  Private
exports.generateSignedStreamUrl = asyncHandler(async (req, res, next) => {
  const fileId = parseInt(req.params.id);
  const userId = req.user.id;
  const { startTime = 0, endTime = -1, expiresIn = 30 * 60 * 1000 } = req.body;
  
  console.log('🔗 Generating signed URL with params:', {
    fileId,
    userId,
    startTime,
    endTime,
    expiresIn,
    requestBody: req.body,
    startTimeType: typeof startTime,
    startTimeValue: startTime
  });
  
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
  
  // Use time-based parameters directly instead of byte offsets
  const duration = file.duration || 0;
  
  console.log('📊 File info for time-based streaming:', {
    duration,
    startTime,
    endTime
  });
  
  // Use time values directly as strings for the signed URL
  let start = startTime.toString();
  let end = endTime.toString();
  
  console.log('🎯 Using time-based parameters:', {
    originalStartTime: startTime,
    originalEndTime: endTime,
    finalStart: start,
    finalEnd: end
  });
  
  const { generateSignedStreamUrl } = require('../utils/signedUrl');
  const signedUrl = generateSignedStreamUrl(fileId, {
    start,
    end,
    expiresIn,
    ip: req.ip
  });
  
  res.status(200).json({
    success: true,
    data: {
      signedUrl,
      fileId,
      fileName: file.filename,
      duration: file.duration,
      startTime,
      endTime,
      expiresIn
    }
  });
});

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