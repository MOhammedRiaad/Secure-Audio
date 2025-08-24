const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const {
  getAudioChapters,
  createAudioChapters,
  updateAudioChapter,
  deleteAudioChapter,
  addSampleChapters
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

router.route('/:chapterId')
  .put(authorize('admin'), updateAudioChapter)
  .delete(authorize('admin'), deleteAudioChapter);

module.exports = router;