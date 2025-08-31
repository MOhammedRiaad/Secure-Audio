const { PrismaClient } = require('@prisma/client');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/async');
const {
  saveUploadMetadata,
  assembleChunks,
  cleanupChunks,
  verifyFileIntegrity,
  chunksDir
} = require('../middleware/chunkedUpload');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AudioDRM = require('../utils/drm');

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
  errorFormat: 'minimal'
});

const drm = new AudioDRM();

// @desc    Initialize chunked upload session
// @route   POST /api/v1/audio/upload/init
// @access  Private/Admin
exports.initChunkedUpload = asyncHandler(async (req, res, next) => {
  const { fileName, fileSize, totalChunks, fileHash, mimeType } = req.body;
  
  // Validate required fields
  if (!fileName || !fileSize || !totalChunks) {
    return next(new ErrorResponse('fileName, fileSize, and totalChunks are required', 400));
  }
  
  // Validate file type
  if (mimeType && !mimeType.startsWith('audio/')) {
    return next(new ErrorResponse('Only audio files are allowed', 400));
  }
  
  // Check file size limit
  const maxFileSize = parseInt(process.env.MAX_FILE_UPLOAD) || 2 * 1024 * 1024 * 1024;
  if (fileSize > maxFileSize) {
    return next(new ErrorResponse(`File size exceeds maximum limit of ${(maxFileSize / (1024 * 1024 * 1024)).toFixed(1)}GB`, 400));
  }
  
  // Generate unique upload ID
  const uploadId = crypto.randomUUID();
  
  // Save upload metadata
  const metadata = {
    uploadId,
    fileName,
    fileSize,
    totalChunks,
    fileHash,
    mimeType,
    userId: req.user.id,
    createdAt: new Date().toISOString(),
    status: 'uploading'
  };
  
  try {
    saveUploadMetadata(uploadId, metadata);
    
    res.status(200).json({
      success: true,
      data: {
        uploadId,
        chunkSize: 5 * 1024 * 1024, // 5MB to match frontend
        totalChunks,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
      }
    });
  } catch (error) {
    return next(new ErrorResponse('Failed to initialize upload session', 500));
  }
});

// @desc    Upload a single chunk
// @route   POST /api/v1/audio/upload/chunk
// @access  Private/Admin
exports.uploadChunk = asyncHandler(async (req, res, next) => {
  if (!req.file) {
    return next(new ErrorResponse('No chunk file provided', 400));
  }
  
  const { uploadId, chunkIndex, totalChunks, fileName } = req.chunkData;
  
  // Save/update metadata
  const uploadDir = path.join(chunksDir, uploadId);
  const metadataPath = path.join(uploadDir, 'metadata.json');
  
  let metadata;
  if (fs.existsSync(metadataPath)) {
    metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  } else {
    metadata = {
      uploadId,
      fileName,
      totalChunks,
      userId: req.user.id,
      createdAt: new Date().toISOString(),
      status: 'uploading'
    };
  }
  
  // Update last activity
  metadata.lastActivity = new Date().toISOString();
  saveUploadMetadata(uploadId, metadata);
  
  // Check if all chunks are uploaded
  const uploadedChunks = [];
  for (let i = 0; i < totalChunks; i++) {
    const chunkPath = path.join(uploadDir, `chunk_${i}`);
    if (fs.existsSync(chunkPath)) {
      uploadedChunks.push(i);
    }
  }
  
  const isComplete = uploadedChunks.length === totalChunks;
  
  res.status(200).json({
    success: true,
    data: {
      uploadId,
      chunkIndex,
      uploadedChunks: uploadedChunks.length,
      totalChunks,
      isComplete,
      progress: Math.round((uploadedChunks.length / totalChunks) * 100)
    }
  });
});

// @desc    Get upload status
// @route   GET /api/v1/audio/upload/status/:uploadId
// @access  Private/Admin
exports.getUploadStatus = asyncHandler(async (req, res, next) => {
  const { uploadStatus } = req;
  
  res.status(200).json({
    success: true,
    data: {
      uploadId: uploadStatus.uploadId,
      fileName: uploadStatus.metadata.fileName,
      uploadedChunks: uploadStatus.uploadedChunks.length,
      totalChunks: uploadStatus.totalChunks,
      isComplete: uploadStatus.isComplete,
      progress: Math.round((uploadStatus.uploadedChunks.length / uploadStatus.totalChunks) * 100),
      status: uploadStatus.metadata.status,
      createdAt: uploadStatus.metadata.createdAt,
      lastActivity: uploadStatus.metadata.lastActivity
    }
  });
});

// @desc    Finalize chunked upload
// @route   POST /api/v1/audio/upload/finalize/:uploadId
// @access  Private/Admin
exports.finalizeUpload = asyncHandler(async (req, res, next) => {
  const { uploadStatus } = req;
  const { title, description, isPublic, coverStorageType } = req.body;
  
  if (!uploadStatus.isComplete) {
    return next(new ErrorResponse('Upload is not complete. Missing chunks.', 400));
  }
  
  const { uploadId, metadata } = uploadStatus;
  const uploadDir = path.join(chunksDir, uploadId);
  
  // Find cover file from uploaded files if any
  const coverFile = req.files ? req.files.find(file => file.fieldname === 'cover') : null;
  
  try {
    // Create final file path
    const uploadsDir = process.env.FILE_UPLOAD_PATH || './uploads';
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(metadata.fileName);
    const finalFileName = `audio-${uniqueSuffix}${ext}`;
    const finalFilePath = path.join(uploadsDir, finalFileName);
    
    // Assemble chunks into final file
    await assembleChunks(uploadId, finalFilePath);
    
    // Verify file integrity if hash was provided
    if (metadata.fileHash) {
      const isValid = verifyFileIntegrity(finalFilePath, metadata.fileHash);
      if (!isValid) {
        // Cleanup and return error
        fs.unlinkSync(finalFilePath);
        cleanupChunks(uploadId);
        return next(new ErrorResponse('File integrity check failed', 400));
      }
    }
    
    let coverImagePath = null;
    let coverImageBase64 = null;
    let coverImageMimeType = null;
    
    // Process cover image if provided (same logic as normal upload)
    if (coverFile) {
      coverImageMimeType = coverFile.mimetype;
      
      // Check storage preference from request body
      const useBase64 = coverStorageType === 'base64';
      
      if (useBase64) {
        // Convert to base64 and remove the file
        const { bufferToBase64 } = require('../middleware/imageUpload');
        const imageBuffer = fs.readFileSync(coverFile.path);
        coverImageBase64 = bufferToBase64(imageBuffer, coverFile.mimetype);
        fs.unlinkSync(coverFile.path); // Clean up the temporary file
      } else {
        // Use file path storage (relative path only)
        coverImagePath = path.basename(coverFile.path);
      }
    }
    
    // Get file duration using ffmpeg if available, otherwise use 0
    const getAudioDuration = async (filePath) => {
      try {
        const ffmpeg = require('fluent-ffmpeg');
        const ffprobeStatic = require('ffprobe-static');
        ffmpeg.setFfprobePath(ffprobeStatic.path);
        
        return new Promise((resolve, reject) => {
          ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) {
              console.warn('Could not extract audio duration:', err.message);
              resolve(0);
            } else {
              resolve(metadata.format.duration || 0);
            }
          });
        });
      } catch (error) {
        console.warn('ffmpeg not available, setting duration to 0');
        return 0;
      }
    };
    
    const duration = await getAudioDuration(finalFilePath);
    
    // Encrypt the assembled file
    const encryptedFileName = `encrypted_${finalFileName}`;
    const encryptedPath = path.join(uploadsDir, encryptedFileName);
    
    const encryptionResult = await drm.encryptAudioFile(finalFilePath, encryptedPath);
    
    // Remove the original unencrypted file
    if (fs.existsSync(finalFilePath)) {
      fs.unlinkSync(finalFilePath);
    }
    
    // Get file stats
    const stats = fs.statSync(encryptedPath);
    
    // Create database record (same as normal upload)
    const audioFile = await prisma.audioFile.create({
      data: {
        filename: metadata.fileName, // Use original filename with extension
        path: encryptedFileName, // Store only relative path
        mimeType: metadata.mimeType || 'audio/mpeg',
        size: stats.size,
        duration,
        title: title || path.parse(metadata.fileName).name, // Title without extension
        description: description || null,
        isPublic: isPublic === 'true' || false,
        isEncrypted: true,
        encryptionKey: encryptionResult.key,
        encryptionIV: encryptionResult.iv,
        encryptionTag: encryptionResult.authTag,
        coverImagePath,
        coverImageBase64,
        coverImageMimeType
      }
    });
    
    // Update metadata status
    metadata.status = 'completed';
    metadata.completedAt = new Date().toISOString();
    metadata.audioFileId = audioFile.id;
    saveUploadMetadata(uploadId, metadata);
    
    // Cleanup original file (keep encrypted version)
    if (fs.existsSync(finalFilePath)) {
      fs.unlinkSync(finalFilePath);
    }
    
    // Schedule chunk cleanup (keep for a short time for verification)
    setTimeout(() => {
      cleanupChunks(uploadId);
    }, 5 * 60 * 1000); // 5 minutes
    
    res.status(201).json({
      success: true,
      data: {
        id: audioFile.id,
        title: audioFile.title,
        filename: audioFile.filename,
        fileSize: audioFile.size,
        mimeType: audioFile.mimeType,
        uploadId,
        status: 'completed'
      }
    });
    
  } catch (error) {
    console.error('Error finalizing upload:', error);
    
    // Cleanup on error
    cleanupChunks(uploadId);
    
    return next(new ErrorResponse('Failed to finalize upload', 500));
  }
});

// @desc    Cancel chunked upload
// @route   DELETE /api/v1/audio/upload/cancel/:uploadId
// @access  Private/Admin
exports.cancelUpload = asyncHandler(async (req, res, next) => {
  const { uploadId } = req.params;
  
  try {
    // Cleanup chunks
    cleanupChunks(uploadId);
    
    res.status(200).json({
      success: true,
      message: 'Upload cancelled successfully'
    });
  } catch (error) {
    return next(new ErrorResponse('Failed to cancel upload', 500));
  }
});

// @desc    Cleanup expired uploads (utility function)
// @route   POST /api/v1/audio/upload/cleanup
// @access  Private/Admin
exports.cleanupExpiredUploads = asyncHandler(async (req, res, next) => {
  try {
    const now = new Date();
    const expirationTime = 24 * 60 * 60 * 1000; // 24 hours
    
    if (!fs.existsSync(chunksDir)) {
      return res.status(200).json({
        success: true,
        message: 'No uploads to cleanup'
      });
    }
    
    const uploadDirs = fs.readdirSync(chunksDir);
    let cleanedCount = 0;
    
    for (const uploadId of uploadDirs) {
      const uploadDir = path.join(chunksDir, uploadId);
      const metadataPath = path.join(uploadDir, 'metadata.json');
      
      if (fs.existsSync(metadataPath)) {
        try {
          const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
          const createdAt = new Date(metadata.createdAt);
          
          if (now - createdAt > expirationTime && metadata.status !== 'completed') {
            cleanupChunks(uploadId);
            cleanedCount++;
          }
        } catch (error) {
          // Invalid metadata, cleanup
          cleanupChunks(uploadId);
          cleanedCount++;
        }
      } else {
        // No metadata, cleanup
        cleanupChunks(uploadId);
        cleanedCount++;
      }
    }
    
    res.status(200).json({
      success: true,
      message: `Cleaned up ${cleanedCount} expired uploads`
    });
  } catch (error) {
    return next(new ErrorResponse('Failed to cleanup expired uploads', 500));
  }
});