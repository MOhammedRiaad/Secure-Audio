const express = require('express');
const {
  getActiveDevices,
  getCurrentDevice,
  deactivateDevice,
  deactivateOtherDevices,
  getDeviceNotifications,
  markNotificationsAsRead,
  updateDeviceName,
  getDeviceSettings,
  updateDeviceSettings
} = require('../controllers/deviceManagement');

const { protect } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(protect);

// Device management routes
router.route('/').get(getActiveDevices);
router.route('/current').get(getCurrentDevice);
router.route('/others').delete(deactivateOtherDevices);
router.route('/settings')
  .get(getDeviceSettings)
  .put(updateDeviceSettings);

// Device notifications
router.route('/notifications')
  .get(getDeviceNotifications);
router.route('/notifications/read')
  .put(markNotificationsAsRead);

// Individual device management
router.route('/:deviceId')
  .delete(deactivateDevice);
router.route('/:deviceId/name')
  .put(updateDeviceName);

module.exports = router;