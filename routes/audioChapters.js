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
  generateChapterStreamUrl
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

router.route('/:chapterId')
  .put(authorize('admin'), updateAudioChapter)
  .delete(authorize('admin'), deleteAudioChapter);

// Chapter streaming routes
router.get('/:chapterId/stream', streamChapter);
router.post('/:chapterId/stream-url', generateChapterStreamUrl);

module.exports = router;