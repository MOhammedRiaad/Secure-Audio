const { PrismaClient } = require('@prisma/client');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/async');
const SessionManager = require('../utils/sessionManager');
const DeviceFingerprint = require('../utils/deviceFingerprint');

const prisma = new PrismaClient();

// @desc    Get user's active devices
// @route   GET /api/v1/devices
// @access  Private
exports.getActiveDevices = asyncHandler(async (req, res, next) => {
  const activeSessions = await SessionManager.getUserActiveSessions(req.user.id);
  
  // Format sessions for response
  const devices = activeSessions.map(session => ({
    id: session.id,
    deviceId: session.deviceId,
    deviceName: session.deviceName,
    deviceType: session.deviceType,
    ipAddress: session.ipAddress,
    lastActivity: session.lastActivity,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    isCurrent: req.headers['x-device-id'] === session.deviceId
  }));
  
  res.status(200).json({
    success: true,
    count: devices.length,
    data: devices
  });
});

// @desc    Get current device information
// @route   GET /api/v1/devices/current
// @access  Private
exports.getCurrentDevice = asyncHandler(async (req, res, next) => {
  const deviceSession = DeviceFingerprint.createDeviceSession(req);
  
  res.status(200).json({
    success: true,
    data: {
      deviceId: deviceSession.deviceId,
      deviceName: deviceSession.deviceName,
      deviceType: deviceSession.deviceType,
      browser: deviceSession.browser,
      os: deviceSession.os,
      ipAddress: deviceSession.ipAddress
    }
  });
});

// @desc    Deactivate a specific device session
// @route   DELETE /api/v1/devices/:deviceId
// @access  Private
exports.deactivateDevice = asyncHandler(async (req, res, next) => {
  const { deviceId } = req.params;
  const currentDeviceId = req.headers['x-device-id'];
  
  // Prevent users from deactivating their current device
  if (deviceId === currentDeviceId) {
    return next(ErrorResponse.badRequest('Cannot deactivate current device. Please use logout instead.'));
  }
  
  // Verify the device belongs to the user
  const session = await prisma.activeSession.findUnique({
    where: {
      userId_deviceId: {
        userId: req.user.id,
        deviceId
      }
    }
  });
  
  if (!session) {
    return next(ErrorResponse.notFound('Device session not found'));
  }
  
  const success = await SessionManager.deactivateSession(req.user.id, deviceId);
  
  if (!success) {
    return next(ErrorResponse.internal('Failed to deactivate device'));
  }
  
  // Create notification for device deactivation
  await SessionManager.createDeviceNotification(
    req.user.id,
    {
      deviceId: session.deviceId,
      deviceName: session.deviceName,
      ipAddress: session.ipAddress
    },
    'device_locked'
  );
  
  res.status(200).json({
    success: true,
    message: 'Device session deactivated successfully'
  });
});

// @desc    Deactivate all other device sessions
// @route   DELETE /api/v1/devices/others
// @access  Private
exports.deactivateOtherDevices = asyncHandler(async (req, res, next) => {
  const currentDeviceId = req.headers['x-device-id'];
  
  if (!currentDeviceId) {
    return next(ErrorResponse.badRequest('Current device ID is required'));
  }
  
  // Get all active sessions except current device
  const otherSessions = await prisma.activeSession.findMany({
    where: {
      userId: req.user.id,
      deviceId: { not: currentDeviceId },
      isActive: true
    }
  });
  
  // Deactivate all other sessions
  await prisma.activeSession.updateMany({
    where: {
      userId: req.user.id,
      deviceId: { not: currentDeviceId },
      isActive: true
    },
    data: { isActive: false }
  });
  
  // Create notifications for each deactivated device
  for (const session of otherSessions) {
    await SessionManager.createDeviceNotification(
      req.user.id,
      {
        deviceId: session.deviceId,
        deviceName: session.deviceName,
        ipAddress: session.ipAddress
      },
      'device_locked'
    );
  }
  
  res.status(200).json({
    success: true,
    message: `${otherSessions.length} device sessions deactivated successfully`,
    deactivatedCount: otherSessions.length
  });
});

// @desc    Get device notifications
// @route   GET /api/v1/devices/notifications
// @access  Private
exports.getDeviceNotifications = asyncHandler(async (req, res, next) => {
  const { unread } = req.query;
  const unreadOnly = unread === 'true';
  
  const notifications = await SessionManager.getDeviceNotifications(req.user.id, unreadOnly);
  
  res.status(200).json({
    success: true,
    count: notifications.length,
    data: notifications
  });
});

// @desc    Mark device notifications as read
// @route   PUT /api/v1/devices/notifications/read
// @access  Private
exports.markNotificationsAsRead = asyncHandler(async (req, res, next) => {
  const { notificationIds } = req.body;
  
  if (!notificationIds || !Array.isArray(notificationIds)) {
    return next(ErrorResponse.validation('Please provide an array of notification IDs'));
  }
  
  const success = await SessionManager.markNotificationsAsRead(req.user.id, notificationIds);
  
  if (!success) {
    return next(ErrorResponse.internal('Failed to mark notifications as read'));
  }
  
  res.status(200).json({
    success: true,
    message: 'Notifications marked as read successfully'
  });
});

// @desc    Update device name
// @route   PUT /api/v1/devices/:deviceId/name
// @access  Private
exports.updateDeviceName = asyncHandler(async (req, res, next) => {
  const { deviceId } = req.params;
  const { deviceName } = req.body;
  
  if (!deviceName || deviceName.trim().length === 0) {
    return next(ErrorResponse.validation('Please provide a device name'));
  }
  
  if (deviceName.length > 100) {
    return next(ErrorResponse.validation('Device name must be less than 100 characters'));
  }
  
  // Verify the device belongs to the user
  const session = await prisma.activeSession.findUnique({
    where: {
      userId_deviceId: {
        userId: req.user.id,
        deviceId
      }
    }
  });
  
  if (!session) {
    return next(ErrorResponse.notFound('Device session not found'));
  }
  
  // Update device name
  const updatedSession = await prisma.activeSession.update({
    where: { id: session.id },
    data: { deviceName: deviceName.trim() }
  });
  
  res.status(200).json({
    success: true,
    message: 'Device name updated successfully',
    data: {
      deviceId: updatedSession.deviceId,
      deviceName: updatedSession.deviceName
    }
  });
});

// @desc    Get device security settings
// @route   GET /api/v1/devices/settings
// @access  Private
exports.getDeviceSettings = asyncHandler(async (req, res, next) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      maxDevices: true,
      activeSessions: {
        where: { isActive: true },
        select: { id: true }
      }
    }
  });
  
  res.status(200).json({
    success: true,
    data: {
      maxDevices: user.maxDevices,
      activeDevicesCount: user.activeSessions.length,
      availableSlots: Math.max(0, user.maxDevices - user.activeSessions.length)
    }
  });
});

// @desc    Update device security settings
// @route   PUT /api/v1/devices/settings
// @access  Private
exports.updateDeviceSettings = asyncHandler(async (req, res, next) => {
  const { maxDevices } = req.body;
  
  if (maxDevices !== undefined) {
    if (!Number.isInteger(maxDevices) || maxDevices < 1 || maxDevices > 10) {
      return next(ErrorResponse.validation('Max devices must be an integer between 1 and 10'));
    }
    
    // If reducing max devices, check if user needs to deactivate some sessions
    const activeSessionsCount = await prisma.activeSession.count({
      where: {
        userId: req.user.id,
        isActive: true
      }
    });
    
    if (maxDevices < activeSessionsCount) {
      return next(ErrorResponse.badRequest(
        `Cannot reduce max devices to ${maxDevices}. You currently have ${activeSessionsCount} active sessions. Please deactivate some devices first.`
      ));
    }
    
    await prisma.user.update({
      where: { id: req.user.id },
      data: { maxDevices }
    });
  }
  
  res.status(200).json({
    success: true,
    message: 'Device settings updated successfully'
  });
});