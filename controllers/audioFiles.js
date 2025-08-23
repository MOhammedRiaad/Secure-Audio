const { PrismaClient } = require('@prisma/client');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/async');
const { generateStreamToken, validateStreamToken } = require('../utils/streamToken');
const AudioDRM = require('../utils/drm');
const { bufferToBase64 } = require('../middleware/imageUpload');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
let ffmpeg;
let ffmpegAvailable = false;

try {
    ffmpeg = require('fluent-ffmpeg');
    const ffprobeStatic = require('ffprobe-static');
    ffmpeg.setFfprobePath(ffprobeStatic.path);
    ffmpegAvailable = true;
  } catch (error) {
  console.warn('FFmpeg not available. Audio duration detection will be limited.');
}

const prisma = new PrismaClient();
const drm = new AudioDRM();

// @desc    Get all audio files (with access)
// @route   GET /api/v1/files
// @access  Private
exports.getAudioFiles = asyncHandler(async (req, res, next) => {
  let whereClause = {};
  
  // Admins can see all files, regular users only see public files or files they have access to
  if (req.user.role !== 'admin') {
    whereClause = {
      OR: [
        { isPublic: true },
        {
          fileAccesses: {
            some: {
              userId: req.user.id,
              canView: true,
              OR: [
                { expiresAt: null },
                { expiresAt: { gt: new Date() } }
              ]
            }
          }
        }
      ]
    };
  }
  
  const files = await prisma.audioFile.findMany({
    where: whereClause,
    include: {
      checkpoints: {
        where: {
          userId: req.user.id
        },
        orderBy: {
          timestamp: 'asc'
        }
      }
    }
  });

  res.status(200).json({
    success: true,
    count: files.length,
    data: files
  });
});

// @desc    Get single audio file
// @route   GET /api/v1/files/:id
// @access  Private
exports.getAudioFile = asyncHandler(async (req, res, next) => {
  const file = await prisma.audioFile.findUnique({
    where: { id: parseInt(req.params.id) },
    include: {
      checkpoints: {
        where: {
          userId: req.user.id
        },
        orderBy: {
          timestamp: 'asc'
        }
      }
    }
  });

  if (!file) {
    return next(
      new ErrorResponse(`File not found with id of ${req.params.id}`, 404)
    );
  }

  // Check if user has access (admins have access to all files)
  if (req.user.role !== 'admin') {
    const hasAccess = await checkFileAccess(req.user.id, file.id);
    
    if (!hasAccess && !file.isPublic) {
      return next(
        new ErrorResponse(`Not authorized to access this file`, 403)
      );
    }
  }

  res.status(200).json({
    success: true,
    data: file
  });
});

// @desc    Upload audio file
// @route   POST /api/v1/files
// @access  Private/Admin
exports.uploadAudioFile = asyncHandler(async (req, res, next) => {
  if (!req.files || req.files.length === 0) {
    return next(new ErrorResponse(`Please upload an audio file`, 400));
  }

  // Find audio and cover files from the uploaded files
  const audioFile = req.files.find(file => file.fieldname === 'audio');
  const coverFile = req.files.find(file => file.fieldname === 'cover');
  
  if (!audioFile) {
    return next(new ErrorResponse(`Please upload an audio file`, 400));
  }

  // Check if file is audio
  if (!audioFile.mimetype.startsWith('audio/')) {
    return next(new ErrorResponse(`Please upload an audio file`, 400));
  }

  // Multer has already saved the file, use the generated filename
  const uploadPath = audioFile.path;
  const fileName = path.basename(audioFile.path);
  const encryptedFileName = `encrypted_${fileName}`;
  const encryptedPath = path.join(path.dirname(uploadPath), encryptedFileName);

  let coverImagePath = null;
  let coverImageBase64 = null;
  let coverImageMimeType = null;

  try {
    // Process cover image if provided
    if (coverFile) {
      coverImageMimeType = coverFile.mimetype;
      
      // Check storage preference from request body
      const useBase64 = req.body.coverStorageType === 'base64';
      
      if (useBase64) {
        // Convert to base64 and remove the file
        const imageBuffer = fs.readFileSync(coverFile.path);
        coverImageBase64 = bufferToBase64(imageBuffer, coverFile.mimetype);
        fs.unlinkSync(coverFile.path); // Clean up the temporary file
      } else {
        // Use file path storage
        coverImagePath = path.basename(coverFile.path);
      }
    }

    // Get file duration using ffmpeg if available, otherwise use 0
    const duration = await getAudioDuration(uploadPath);
    
    // Encrypt the audio file at rest
    const encryptionResult = await drm.encryptAudioFile(uploadPath, encryptedPath);
    
    // Remove the original unencrypted file
    if (fs.existsSync(uploadPath)) {
      fs.unlinkSync(uploadPath);
    }
    
    // Create file in database with encryption metadata and cover image
    const audioFileRecord = await prisma.audioFile.create({
      data: {
        filename: audioFile.originalname,
        path: encryptedFileName,
        mimeType: audioFile.mimetype,
        size: audioFile.size,
        duration,
        title: req.body.title || path.parse(audioFile.originalname).name,
        description: req.body.description || null,
        isPublic: req.body.isPublic === 'true' || false,
        isEncrypted: true,
        encryptionKey: encryptionResult.key,
        encryptionIV: encryptionResult.iv,
        coverImagePath,
        coverImageBase64,
        coverImageMimeType
      }
    });
    
    return res.status(201).json({
      success: true,
      data: {
        ...audioFileRecord,
        // Don't expose encryption keys in response
        encryptionKey: undefined,
        encryptionIV: undefined
      }
    });
  } catch (error) {
    // Clean up files if there was an error
    if (fs.existsSync(uploadPath)) {
      fs.unlinkSync(uploadPath);
    }
    if (fs.existsSync(encryptedPath)) {
      fs.unlinkSync(encryptedPath);
    }
    if (coverFile && fs.existsSync(coverFile.path)) {
      fs.unlinkSync(coverFile.path);
    }
    console.error('Error processing file upload:', error);
    return next(new ErrorResponse('Error processing file upload', 500));
  }
});

// @desc    Generate a secure stream token
// @route   GET /api/v1/files/stream-token/:id
// @access  Private
exports.generateStreamToken = asyncHandler(async (req, res, next) => {
  const file = await prisma.audioFile.findUnique({
    where: { id: parseInt(req.params.id) }
  });

  if (!file) {
    return next(new ErrorResponse('File not found', 404));
  }

  // Check if user has access (admins have access to all files)
  if (req.user.role !== 'admin') {
    const hasAccess = await checkFileAccess(req.user.id, file.id);
    
    if (!hasAccess && !file.isPublic) {
      return next(new ErrorResponse('Not authorized to access this file', 403));
    }
  }

  // Generate a secure token
  const token = await generateStreamToken(file.id, req.user.id);
  
  res.status(200).json({
    success: true,
    data: { token }
  });
});

// @desc    Stream audio file with token-based authentication
// @route   GET /api/v1/files/stream/:token
// @access  Private
exports.streamAudioFile = asyncHandler(async (req, res, next) => {
  // Validate the token
  const { valid, fileId, userId, error } = await validateStreamToken(req.params.token);
  
  if (!valid) {
    return next(new ErrorResponse(error || 'Invalid or expired token', 403));
  }
  
  // Get the file
  const file = await prisma.audioFile.findUnique({
    where: { id: parseInt(fileId) }
  });

  if (!file) {
    return next(new ErrorResponse('File not found', 404));
  }
  
  // Get user information to check if they're an admin
  const user = await prisma.user.findUnique({
    where: { id: parseInt(userId) },
    select: { role: true }
  });
  
  // Verify the user still has access (admins have access to all files)
  if (user && user.role !== 'admin') {
    const hasAccess = await checkFileAccess(userId, file.id);
    if (!hasAccess && !file.isPublic) {
      return next(new ErrorResponse('Access to this file has been revoked', 403));
    }
  }

  const filePath = path.join(process.env.FILE_UPLOAD_PATH, file.path);
  
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    return next(new ErrorResponse('File not found on server', 404));
  }

  const mimeType = file.mimeType || 'audio/mpeg'; // Default to audio/mpeg if not set

  // Security headers to prevent download and caching
  const securityHeaders = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Content-Security-Policy': "default-src 'none'",
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Content-Disposition': 'inline', // Prevents download by default
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  };

  // Handle encrypted files
  if (file.isEncrypted && file.encryptionKey && file.encryptionIV) {
    try {
      // Create a temporary decrypted stream
      const decryptedStream = drm.createDecryptedStream(filePath, {
        key: file.encryptionKey,
        iv: file.encryptionIV
      });
      
      // Set headers for encrypted audio streaming (no range support)
      const head = {
        'Accept-Ranges': 'none', // Disable range requests for encrypted files
        'Content-Type': mimeType,
        ...securityHeaders
      };
      
      res.writeHead(200, head);
      
      // Stream the decrypted content
      decryptedStream.pipe(res);
      
      // Log the streaming access
      console.log(`Encrypted file streamed: ${file.filename} by user ${userId}`);
      return;
      
    } catch (decryptError) {
      console.error('Decryption error:', decryptError);
      return next(new ErrorResponse('Error decrypting file', 500));
    }
  }

  // Handle unencrypted files (legacy support)
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    // Parse Range header
    const parts = range.replace(/bytes=/, '').split('-')
    const start = parseInt(parts[0], 10)
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
    const chunkSize = (end - start) + 1
    
    // Validate range
    if (start >= fileSize || end >= fileSize) {
      // Return 416 Range Not Satisfiable if range is invalid
      res.writeHead(416, {
        'Content-Range': `bytes */${fileSize}`,
        ...securityHeaders
      });
      return res.end();
    }

    const fileStream = fs.createReadStream(filePath, { start, end });
    
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': mimeType,
      ...securityHeaders
    };

    res.writeHead(206, head);
    fileStream.pipe(res);
  } else {
    // For non-range requests, force range requests by not supporting full file streaming
    // This prevents direct download of the full file
    const head = {
      'Accept-Ranges': 'bytes',
      'Content-Length': 0,
      'Content-Type': mimeType,
      ...securityHeaders
    };
    
    res.writeHead(200, head);
    res.end();
  }
});

// @desc    Delete audio file
// @route   DELETE /api/v1/files/:id
// @access  Private/Admin
exports.deleteAudioFile = asyncHandler(async (req, res, next) => {
  const file = await prisma.audioFile.findUnique({
    where: { id: parseInt(req.params.id) }
  });

  if (!file) {
    return next(
      new ErrorResponse(`File not found with id of ${req.params.id}`, 404)
    );
  }

  // Delete file from filesystem
  const filePath = path.join(process.env.FILE_UPLOAD_PATH, file.path);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  // Delete from database
  await prisma.audioFile.delete({
    where: { id: parseInt(req.params.id) }
  });

  res.status(200).json({
    success: true,
    data: {}
  });
});

// Helper function to check if user has access to a file
const checkFileAccess = async (userId, fileId) => {
  const access = await prisma.fileAccess.findFirst({
    where: {
      userId,
      fileId,
      canView: true,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } }
      ]
    }
  });

  return !!access;
};

// Helper function to get audio duration using ffmpeg or fallback
const getAudioDuration = async (filePath) => {
  if (ffmpegAvailable) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          console.error('Error getting audio duration with ffmpeg:', err);
          // Fallback to 0 if ffmpeg fails
          resolve(0);
        } else {
          resolve(metadata.format.duration || 0);
        }
      });
    });
  }
  
  // Fallback: Return 0 if ffmpeg is not available
  console.warn('FFmpeg not available. Using default duration of 0.');
  return 0;
};
