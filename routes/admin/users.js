const express = require('express');
const { protect, authorize } = require('../../middleware/auth');
const {
  getUsers,
  getUser,
  deleteUser,
  getUserCount
} = require('../../controllers/admin/users');

const router = express.Router();

// All routes are protected and require admin role
router.use(protect);
router.use(authorize('admin'));

router.route('/')
  .get(getUsers);

router.route('/count')
  .get(getUserCount);

router.route('/:id')
  .get(getUser)
  .delete(deleteUser);

module.exports = router;
