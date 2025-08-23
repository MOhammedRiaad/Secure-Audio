const express = require('express');
const { protect } = require('../middleware/auth');
const {
  getCheckpoints,
  getCheckpoint,
  createCheckpoint,
  updateCheckpoint,
  deleteCheckpoint
} = require('../controllers/checkpoints');

const router = express.Router();

// Re-route into other resource routers
// This is a nested route for getting checkpoints for a specific file
router.route('/file/:fileId').get(protect, getCheckpoints);

router
  .route('/')
  .post(protect, createCheckpoint);

router
  .route('/:id')
  .get(protect, getCheckpoint)
  .put(protect, updateCheckpoint)
  .delete(protect, deleteCheckpoint);

module.exports = router;
