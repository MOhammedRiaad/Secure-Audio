const express = require('express');
const { protect, authorize } = require('../../middleware/auth');
const chunkCleanupService = require('../../services/chunkCleanupService');
const asyncHandler = require('../../middleware/async');
const ErrorResponse = require('../../utils/errorResponse');

const router = express.Router();

// @desc    Trigger manual cleanup of chunk uploads
// @route   POST /api/v1/admin/cleanup/chunks
// @access  Private/Admin
router.post('/chunks', protect, authorize('admin'), asyncHandler(async (req, res, next) => {
  try {
    const result = await chunkCleanupService.manualCleanup();
    
    res.status(200).json({
      success: true,
      message: 'Manual cleanup completed successfully',
      data: {
        cleanedFiles: result.cleanedFiles,
        cleanedDirs: result.cleanedDirs,
        errors: result.errors,
        duration: result.duration
      }
    });
  } catch (error) {
    console.error('Manual cleanup error:', error);
    return next(new ErrorResponse('Failed to perform manual cleanup', 500));
  }
}));

// @desc    Get cleanup service status
// @route   GET /api/v1/admin/cleanup/status
// @access  Private/Admin
router.get('/status', protect, authorize('admin'), asyncHandler(async (req, res, next) => {
  try {
    const status = chunkCleanupService.getStatus();
    
    res.status(200).json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('Get cleanup status error:', error);
    return next(new ErrorResponse('Failed to get cleanup status', 500));
  }
}));

// @desc    Update cleanup service settings
// @route   PUT /api/v1/admin/cleanup/settings
// @access  Private/Admin
router.put('/settings', protect, authorize('admin'), asyncHandler(async (req, res, next) => {
  try {
    const { maxAge, cronSchedule, maxFilesPerRun } = req.body;
    
    const newSettings = {};
    if (maxAge !== undefined) newSettings.maxAge = maxAge;
    if (cronSchedule !== undefined) newSettings.cronSchedule = cronSchedule;
    if (maxFilesPerRun !== undefined) newSettings.maxFilesPerRun = maxFilesPerRun;
    
    chunkCleanupService.updateSettings(newSettings);
    
    res.status(200).json({
      success: true,
      message: 'Cleanup settings updated successfully',
      data: chunkCleanupService.getStatus()
    });
  } catch (error) {
    console.error('Update cleanup settings error:', error);
    return next(new ErrorResponse('Failed to update cleanup settings', 500));
  }
}));

// @desc    Start cleanup service
// @route   POST /api/v1/admin/cleanup/start
// @access  Private/Admin
router.post('/start', protect, authorize('admin'), asyncHandler(async (req, res, next) => {
  try {
    chunkCleanupService.start();
    
    res.status(200).json({
      success: true,
      message: 'Cleanup service started successfully',
      data: chunkCleanupService.getStatus()
    });
  } catch (error) {
    console.error('Start cleanup service error:', error);
    return next(new ErrorResponse('Failed to start cleanup service', 500));
  }
}));

// @desc    Stop cleanup service
// @route   POST /api/v1/admin/cleanup/stop
// @access  Private/Admin
router.post('/stop', protect, authorize('admin'), asyncHandler(async (req, res, next) => {
  try {
    chunkCleanupService.stop();
    
    res.status(200).json({
      success: true,
      message: 'Cleanup service stopped successfully',
      data: chunkCleanupService.getStatus()
    });
  } catch (error) {
    console.error('Stop cleanup service error:', error);
    return next(new ErrorResponse('Failed to stop cleanup service', 500));
  }
}));

module.exports = router;