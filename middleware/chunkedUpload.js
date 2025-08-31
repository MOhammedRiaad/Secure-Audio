const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const asyncHandler = require('./async');
const ErrorResponse = require('../utils/errorResponse');

// Create chunks directory if it doesn't exist
const chunksDir = process.env.CHUNKS_UPLOAD_PATH || './chunks';
if (!fs.existsSync(chunksDir)) {
  fs.mkdirSync(chunksDir, { recursive: true });
}

// Storage configuration for chunks
const chunkStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadId = req.body.uploadId || req.headers['x-upload-id'];
    if (!uploadId) {
      return cb(new Error('Upload ID is required for chunked uploads'), false);
    }
    
    const uploadDir = path.join(chunksDir, uploadId);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const chunkIndex = req.body.chunkIndex || req.headers['x-chunk-index'];
    if (chunkIndex === undefined) {
      return cb(new Error('Chunk index is required'), false);
    }
    cb(null, `chunk_${chunkIndex}`);
  }
});

// Configure multer for chunk uploads
const chunkUpload = multer({
  storage: chunkStorage,
  limits: {
    fileSize: 6 * 1024 * 1024, // 6MB to allow for 5MB chunks plus headers/metadata
    fieldSize: 1024, // 1KB for metadata fields
    files: 1,
    parts: 5
  },
  fileFilter: (req, file, cb) => {
    // Allow any file type for chunks
    cb(null, true);
  }
});

// Middleware to handle chunk upload validation
const validateChunkUpload = asyncHandler(async (req, res, next) => {
  const { uploadId, chunkIndex, totalChunks, fileName, fileSize, fileHash } = req.body;
  const headers = req.headers;
  
  // Extract from headers if not in body
  const finalUploadId = uploadId || headers['x-upload-id'];
  const finalChunkIndex = parseInt(chunkIndex || headers['x-chunk-index']);
  const finalTotalChunks = parseInt(totalChunks || headers['x-total-chunks']);
  const finalFileName = fileName || headers['x-file-name'];
  const finalFileSize = parseInt(fileSize || headers['x-file-size']);
  const finalFileHash = fileHash || headers['x-file-hash'];
  
  // Validate required fields
  if (!finalUploadId) {
    return next(new ErrorResponse('Upload ID is required', 400));
  }
  
  if (isNaN(finalChunkIndex) || finalChunkIndex < 0) {
    return next(new ErrorResponse('Valid chunk index is required', 400));
  }
  
  if (isNaN(finalTotalChunks) || finalTotalChunks <= 0) {
    return next(new ErrorResponse('Valid total chunks count is required', 400));
  }
  
  if (finalChunkIndex >= finalTotalChunks) {
    return next(new ErrorResponse('Chunk index cannot be greater than or equal to total chunks', 400));
  }
  
  if (!finalFileName) {
    return next(new ErrorResponse('File name is required', 400));
  }
  
  if (isNaN(finalFileSize) || finalFileSize <= 0) {
    return next(new ErrorResponse('Valid file size is required', 400));
  }
  
  // Check file size limit (2GB)
  const maxFileSize = parseInt(process.env.MAX_FILE_UPLOAD) || 2 * 1024 * 1024 * 1024;
  if (finalFileSize > maxFileSize) {
    return next(new ErrorResponse(`File size exceeds maximum limit of ${(maxFileSize / (1024 * 1024 * 1024)).toFixed(1)}GB`, 400));
  }
  
  // Store validated data in request
  req.chunkData = {
    uploadId: finalUploadId,
    chunkIndex: finalChunkIndex,
    totalChunks: finalTotalChunks,
    fileName: finalFileName,
    fileSize: finalFileSize,
    fileHash: finalFileHash
  };
  
  next();
});

// Middleware to check upload status
const checkUploadStatus = asyncHandler(async (req, res, next) => {
  const { uploadId } = req.params;
  
  if (!uploadId) {
    return next(new ErrorResponse('Upload ID is required', 400));
  }
  
  const uploadDir = path.join(chunksDir, uploadId);
  const metadataPath = path.join(uploadDir, 'metadata.json');
  
  if (!fs.existsSync(uploadDir) || !fs.existsSync(metadataPath)) {
    return next(new ErrorResponse('Upload session not found', 404));
  }
  
  try {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    
    // Check which chunks are uploaded
    const uploadedChunks = [];
    for (let i = 0; i < metadata.totalChunks; i++) {
      const chunkPath = path.join(uploadDir, `chunk_${i}`);
      if (fs.existsSync(chunkPath)) {
        uploadedChunks.push(i);
      }
    }
    
    req.uploadStatus = {
      uploadId,
      metadata,
      uploadedChunks,
      totalChunks: metadata.totalChunks,
      isComplete: uploadedChunks.length === metadata.totalChunks
    };
    
    next();
  } catch (error) {
    return next(new ErrorResponse('Invalid upload metadata', 500));
  }
});

// Function to save upload metadata
const saveUploadMetadata = (uploadId, metadata) => {
  const uploadDir = path.join(chunksDir, uploadId);
  const metadataPath = path.join(uploadDir, 'metadata.json');
  
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
};

// Function to assemble chunks into final file
const assembleChunks = async (uploadId, outputPath) => {
  const uploadDir = path.join(chunksDir, uploadId);
  const metadataPath = path.join(uploadDir, 'metadata.json');
  
  if (!fs.existsSync(metadataPath)) {
    throw new Error('Upload metadata not found');
  }
  
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  const writeStream = fs.createWriteStream(outputPath);
  
  return new Promise((resolve, reject) => {
    let currentChunk = 0;
    
    const writeNextChunk = () => {
      if (currentChunk >= metadata.totalChunks) {
        writeStream.end();
        return;
      }
      
      const chunkPath = path.join(uploadDir, `chunk_${currentChunk}`);
      
      if (!fs.existsSync(chunkPath)) {
        reject(new Error(`Chunk ${currentChunk} not found`));
        return;
      }
      
      const readStream = fs.createReadStream(chunkPath);
      
      readStream.on('data', (chunk) => {
        writeStream.write(chunk);
      });
      
      readStream.on('end', () => {
        currentChunk++;
        writeNextChunk();
      });
      
      readStream.on('error', (error) => {
        reject(error);
      });
    };
    
    writeStream.on('finish', () => {
      resolve(outputPath);
    });
    
    writeStream.on('error', (error) => {
      reject(error);
    });
    
    writeNextChunk();
  });
};

// Function to cleanup chunks
const cleanupChunks = (uploadId) => {
  const uploadDir = path.join(chunksDir, uploadId);
  
  if (fs.existsSync(uploadDir)) {
    fs.rmSync(uploadDir, { recursive: true, force: true });
  }
};

// Function to verify file integrity
const verifyFileIntegrity = (filePath, expectedHash) => {
  if (!expectedHash) {
    return true; // Skip verification if no hash provided
  }
  
  const fileBuffer = fs.readFileSync(filePath);
  const actualHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  
  return actualHash === expectedHash;
};

module.exports = {
  chunkUpload,
  validateChunkUpload,
  checkUploadStatus,
  saveUploadMetadata,
  assembleChunks,
  cleanupChunks,
  verifyFileIntegrity,
  chunksDir
};