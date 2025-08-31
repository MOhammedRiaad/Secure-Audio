const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const {
  getAudioFiles,
  getAudioFile,
  uploadAudioFile,
  streamAudioFile,
  deleteAudioFile,
  generateStreamToken
} = require('../controllers/audioFiles');
const upload = require('../middleware/upload');
const { imageUpload } = require('../middleware/imageUpload');
const { streamingLimiter } = require('../middleware/rateLimiter');

const largeFileUploadHandler = require('../middleware/largeFileUpload');

const multer = require('multer');

// Import chapter routes
const audioChapterRoutes = require('./audioChapters');

const router = express.Router();

// Configure multer for multiple file uploads (audio + optional cover)
const uploadFields = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      if (file.fieldname === 'audio') {
        cb(null, process.env.FILE_UPLOAD_PATH || './uploads');
      } else if (file.fieldname === 'cover') {
        cb(null, './covers');
      } else {
        cb(new Error('Unexpected field name: ' + file.fieldname), false);
      }
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = require('path').extname(file.originalname);
      if (file.fieldname === 'audio') {
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
      } else if (file.fieldname === 'cover') {
        cb(null, 'cover-' + uniqueSuffix + ext);
      }
    }
  }),
  fileFilter: function (req, file, cb) {
    if (file.fieldname === 'audio') {
      if (!file.mimetype.startsWith('audio/')) {
        return cb(new Error('Only audio files are allowed for audio field!'), false);
      }
    } else if (file.fieldname === 'cover') {
      if (!file.mimetype.startsWith('image/')) {
        return cb(new Error('Only image files are allowed for cover field!'), false);
      }
    } else {
      return cb(new Error('Unexpected field name: ' + file.fieldname), false);
    }
    cb(null, true);
  },
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_UPLOAD) || 2 * 1024 * 1024 * 1024, // 2GB default for large audio files
    fieldSize: 100 * 1024 * 1024, // 100MB for individual fields
    files: 2, // Maximum 2 files (audio + cover)
    parts: 8 // Maximum 5 parts (including text fields)
  }
}).any(); // Use .any() instead of .fields() to be more flexible

// Public routes (no auth required for public files)
router.route('/')
  .get(protect, getAudioFiles)

  .post(protect, authorize('admin'), largeFileUploadHandler, uploadFields, uploadAudioFile);


router.route('/:id')
  .get(protect, getAudioFile)
  .delete(protect, authorize('admin'), deleteAudioFile);

// Stream token and streaming routes
router.get('/stream-token/:id', protect, generateStreamToken);
router.get('/stream/:token', streamingLimiter, streamAudioFile);

// Mount chapter routes
router.use('/:fileId/chapters', audioChapterRoutes);

// Cover image serving route
router.get('/cover/:id', async (req, res) => {
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    const fs = require('fs');
    const path = require('path');
    
    const audioFile = await prisma.audioFile.findUnique({
      where: { id: parseInt(req.params.id) }
    });
    
    if (!audioFile) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }
    
    // If base64 cover exists, serve it
    if (audioFile.coverImageBase64) {
      const base64Data = audioFile.coverImageBase64.split(',')[1];
      const buffer = Buffer.from(base64Data, 'base64');
      res.set('Content-Type', audioFile.coverImageMimeType);
      res.set('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
      return res.send(buffer);
    }
    
    // If file path cover exists, serve the file
    if (audioFile.coverImagePath) {
      const coverPath = path.join('./covers', audioFile.coverImagePath);
      if (fs.existsSync(coverPath)) {
        res.set('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
        return res.sendFile(path.resolve(coverPath));
      }
    }
    
    // No cover image found
    res.status(404).json({ success: false, message: 'Cover image not found' });
  } catch (error) {
    console.error('Error serving cover image:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
