const express = require('express');
const { protect, authorize } = require('../../middleware/auth');
const {
  getFileAccesses,
  grantFileAccess,
  revokeFileAccess,
  updateFileAccess
} = require('../../controllers/admin/fileAccess');

const router = express.Router();

// All routes are protected and require admin role
router.use(protect);
router.use(authorize('admin'));

// Get all file accesses for a specific file
router.get('/file/:fileId', getFileAccesses);

// Grant access to a file for a user
router.post('/', grantFileAccess);

// Update file access (e.g., change expiration)
router.put('/:id', updateFileAccess);

// Revoke file access
router.delete('/:id', revokeFileAccess);

module.exports = router;
