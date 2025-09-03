const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const {
  getAudioChapters,
  createAudioChapters,
  updateAudioChapter,
  deleteAudioChapter,
  addSampleChapters,
  finalizeChapters,
  getChapterStatus,
  streamChapter,
  generateChapterStreamUrl,
  cleanupTempFolders
} = require('../controllers/audioChapters');

const router = express.Router({ mergeParams: true });

// All routes require authentication
router.use(protect);

// Routes for /api/v1/files/:fileId/chapters
router.route('/')
  .get(getAudioChapters)
  .post(authorize('admin'), createAudioChapters);

// Sample chapters route
router.post('/sample', authorize('admin'), addSampleChapters);

// Chapter finalization routes
router.post('/finalize', authorize('admin'), finalizeChapters);
router.get('/status', authorize('admin'), getChapterStatus);

// Temp cleanup route
router.post('/cleanup-temp', authorize('admin'), cleanupTempFolders);

router.route('/:chapterId')
  .put(authorize('admin'), updateAudioChapter)
  .delete(authorize('admin'), deleteAudioChapter);

// Chapter streaming routes with OPTIONS handling
router.options('/:chapterId/stream-chapter', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Authorization, X-Device-Fingerprint');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.status(200).end();
});

// Chapter streaming - this is more specific so it won't conflict
router.get('/:chapterId/stream-chapter', streamChapter);
router.post('/:chapterId/stream-url', generateChapterStreamUrl);

module.exports = router;