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

const router = express.Router();

// Public routes (no auth required for public files)
router.route('/')
  .get(protect, getAudioFiles)
  .post(protect, authorize('admin'), upload.single('file'), uploadAudioFile);

router.route('/:id')
  .get(protect, getAudioFile)
  .delete(protect, authorize('admin'), deleteAudioFile);

// Stream token and streaming routes
router.get('/stream-token/:id', protect, generateStreamToken);
router.get('/stream/:token', streamAudioFile);

module.exports = router;
