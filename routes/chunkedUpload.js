const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const {
  initChunkedUpload,
  uploadChunk,
  getUploadStatus,
  finalizeUpload,
  cancelUpload,
  cleanupExpiredUploads
} = require('../controllers/chunkedUpload');
const {
  chunkUpload,
  validateChunkUpload,
  checkUploadStatus
} = require('../middleware/chunkedUpload');
const largeFileUploadHandler = require('../middleware/largeFileUpload');
const multer = require('multer');

// Configure multer for cover image upload during finalization
const finalizeUpload_multer = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      if (file.fieldname === 'cover') {
        cb(null, './covers');
      } else {
        cb(new Error('Unexpected field name: ' + file.fieldname), false);
      }
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = require('path').extname(file.originalname);
      cb(null, 'cover-' + uniqueSuffix + ext);
    }
  }),
  fileFilter: function (req, file, cb) {
    if (file.fieldname === 'cover') {
      if (!file.mimetype.startsWith('image/')) {
        return cb(new Error('Only image files are allowed for cover field!'), false);
      }
    }
    cb(null, true);
  },
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB for cover images
    files: 1 // Only cover image
  }
}).any();

const router = express.Router();

// @desc    Initialize chunked upload session
// @route   POST /api/v1/audio/upload/init
// @access  Private/Admin
router.post('/init', protect, authorize('admin'), initChunkedUpload);

// @desc    Upload a single chunk
// @route   POST /api/v1/audio/upload/chunk
// @access  Private/Admin
router.post('/chunk', 
  protect, 
  authorize('admin'), 
  largeFileUploadHandler,
  chunkUpload.single('chunk'),
  validateChunkUpload,
  uploadChunk
);

// @desc    Get upload status
// @route   GET /api/v1/audio/upload/status/:uploadId
// @access  Private/Admin
router.get('/status/:uploadId', 
  protect, 
  authorize('admin'), 
  checkUploadStatus, 
  getUploadStatus
);

// @desc    Finalize chunked upload
// @route   POST /api/v1/audio/upload/finalize/:uploadId
// @access  Private/Admin
router.post('/finalize/:uploadId', 
  protect, 
  authorize('admin'), 
  finalizeUpload_multer,
  checkUploadStatus, 
  finalizeUpload
);

// @desc    Cancel chunked upload
// @route   DELETE /api/v1/audio/upload/cancel/:uploadId
// @access  Private/Admin
router.delete('/cancel/:uploadId', 
  protect, 
  authorize('admin'), 
  cancelUpload
);

// @desc    Cleanup expired uploads
// @route   POST /api/v1/audio/upload/cleanup
// @access  Private/Admin
router.post('/cleanup', 
  protect, 
  authorize('admin'), 
  cleanupExpiredUploads
);

module.exports = router;