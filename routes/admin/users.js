const express = require('express');
const { protect, authorize } = require('../../middleware/auth');
const {
  getUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  getUserCount,
  unlockUser,
  getUserSessions,
  terminateUserSession,
  getUsersWithSessions
} = require('../../controllers/admin/users');

const router = express.Router();

// All routes are protected and require admin role
router.use(protect);
router.use(authorize('admin'));

router.route('/')
  .get(getUsers)
  .post(createUser);

router.route('/count')
  .get(getUserCount);

router.route('/with-sessions')
  .get(getUsersWithSessions);

router.route('/:id')
  .get(getUser)
  .put(updateUser)
  .delete(deleteUser);

router.route('/:id/unlock')
  .patch(unlockUser);

router.route('/:id/sessions')
  .get(getUserSessions);

router.route('/:id/sessions/:sessionId')
  .delete(terminateUserSession);

module.exports = router;
