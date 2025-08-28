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

const router = express.Router();

// Generate secure DRM streaming session
router.post('/session/:id', protect, generateDRMSession);

// Stream DRM protected audio (no auth middleware - uses session token)
router.options('/stream/:sessionToken', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Authorization, X-Device-Fingerprint');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.status(200).end();
});

router.get('/stream/:sessionToken', streamDRMProtectedAudio);

// Stream DRM-protected audio in chunks
router.get('/stream/:sessionToken/chunk/:chunkNumber', streamDRMProtectedAudio);

// Encrypt audio file (admin only)
router.post('/encrypt/:id', protect, authorize('admin'), encryptAudioFile);

// Get DRM protection status
router.get('/status/:id', protect, getDRMStatus);

// Generate signed URL for timestamp-based streaming
router.post('/signed-url/:id', protect, generateSignedStreamUrl);


router.get('/audio/:id/stream-signed', streamSignedAudio);

module.exports = router;