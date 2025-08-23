const express = require('express');
const {
  generateDRMSession,
  streamDRMProtectedAudio,
  encryptAudioFile,
  getDRMStatus
} = require('../controllers/drmStream');

const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Generate secure DRM streaming session
router.post('/session/:id', protect, generateDRMSession);

// Stream DRM protected audio (no auth middleware - uses session token)
router.get('/stream/:sessionToken', streamDRMProtectedAudio);

// Stream DRM-protected audio in chunks
router.get('/stream/:sessionToken/chunk/:chunkNumber', streamDRMProtectedAudio);

// Encrypt audio file (admin only)
router.post('/encrypt/:id', protect, authorize('admin'), encryptAudioFile);

// Get DRM protection status
router.get('/status/:id', protect, getDRMStatus);

module.exports = router;