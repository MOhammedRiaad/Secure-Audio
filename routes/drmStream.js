const express = require('express');
const {
  generateDRMSession,
  streamDRMProtectedAudio,
  encryptAudioFile,
  getDRMStatus,
  streamSignedAudio,
  generateSignedStreamUrl
} = require('../controllers/drmStream');

const { protect, authorize } = require('../middleware/auth');
const { streamingLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// Generate secure DRM streaming session
router.post('/session/:id', protect, generateDRMSession);

// Stream DRM protected audio (no auth middleware - uses session token)
router.get('/stream/:sessionToken', streamingLimiter, streamDRMProtectedAudio);

// Stream DRM-protected audio in chunks
router.get('/stream/:sessionToken/chunk/:chunkNumber', streamingLimiter, streamDRMProtectedAudio);

// Encrypt audio file (admin only)
router.post('/encrypt/:id', protect, authorize('admin'), encryptAudioFile);

// Get DRM protection status
router.get('/status/:id', protect, getDRMStatus);

// Generate signed URL for timestamp-based streaming
router.post('/signed-url/:id', protect, generateSignedStreamUrl);


router.get('/audio/:id/stream-signed', streamingLimiter, streamSignedAudio);

module.exports = router;