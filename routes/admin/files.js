const express = require('express');
const { protect, authorize } = require('../../middleware/auth');
const {
  getFiles,
  getFile,
  deleteFile,
  getFileStats
} = require('../../controllers/admin/files');

const router = express.Router();

// All routes are protected and require admin role
router.use(protect);
router.use(authorize('admin'));

router.route('/')
  .get(getFiles);

router.route('/stats')
  .get(getFileStats);

router.route('/:id')
  .get(getFile)
  .delete(deleteFile);

module.exports = router;
