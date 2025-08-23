const { PrismaClient } = require('@prisma/client');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/async');

const prisma = new PrismaClient();

// @desc    Get all checkpoints for a file
// @route   GET /api/v1/checkpoints/file/:fileId
// @access  Private
exports.getCheckpoints = asyncHandler(async (req, res, next) => {
  // Check if user has access to the file
  const file = await prisma.audioFile.findUnique({
    where: { id: parseInt(req.params.fileId) },
    include: {
      fileAccesses: {
        where: {
          userId: req.user.id,
          canView: true,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } }
          ]
        }
      }
    }
  });

  // Check file access (admins can access checkpoints for any file)
  if (req.user.role !== 'admin') {
    if (!file || (!file.isPublic && file.fileAccesses.length === 0)) {
      return next(
        new ErrorResponse('Not authorized to access checkpoints for this file', 403)
      );
    }
  } else if (!file) {
    return next(
      new ErrorResponse('File not found', 404)
    );
  }

  const checkpoints = await prisma.checkpoint.findMany({
    where: {
      fileId: parseInt(req.params.fileId),
      userId: req.user.id // Only user's own checkpoints
    },
    orderBy: {
      timestamp: 'asc'
    }
  });

  res.status(200).json({
    success: true,
    count: checkpoints.length,
    data: checkpoints
  });
});

// @desc    Get single checkpoint
// @route   GET /api/v1/checkpoints/:id
// @access  Private
exports.getCheckpoint = asyncHandler(async (req, res, next) => {
  const checkpoint = await prisma.checkpoint.findUnique({
    where: { id: parseInt(req.params.id) }
  });

  if (!checkpoint) {
    return next(
      new ErrorResponse(`Checkpoint not found with id of ${req.params.id}`, 404)
    );
  }

  // Check if user has access to this checkpoint
  if (checkpoint.userId !== req.user.id) {
    return next(
      new ErrorResponse('Not authorized to access this checkpoint', 403)
    );
  }

  res.status(200).json({
    success: true,
    data: checkpoint
  });
});

// @desc    Create new checkpoint
// @route   POST /api/v1/checkpoints
// @access  Private
exports.createCheckpoint = asyncHandler(async (req, res, next) => {
  // Add user to req.body
  req.body.userId = req.user.id;
  
  // Check if user has access to the file
  const file = await prisma.audioFile.findUnique({
    where: { id: parseInt(req.body.fileId) },
    include: {
      fileAccesses: {
        where: {
          userId: req.user.id,
          canView: true,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } }
          ]
        }
      }
    }
  });

  // Check file access (admins can create checkpoints for any file)
  if (req.user.role !== 'admin') {
    if (!file || (!file.isPublic && file.fileAccesses.length === 0)) {
      return next(
        new ErrorResponse('Not authorized to access this file', 403)
      );
    }
  } else if (!file) {
    return next(
      new ErrorResponse('File not found', 404)
    );
  }

  const checkpoint = await prisma.checkpoint.create({
    data: req.body
  });

  res.status(201).json({
    success: true,
    data: checkpoint
  });
});

// @desc    Update checkpoint
// @route   PUT /api/v1/checkpoints/:id
// @access  Private
exports.updateCheckpoint = asyncHandler(async (req, res, next) => {
  let checkpoint = await prisma.checkpoint.findUnique({
    where: { id: parseInt(req.params.id) }
  });

  if (!checkpoint) {
    return next(
      new ErrorResponse(`Checkpoint not found with id of ${req.params.id}`, 404)
    );
  }

  // Make sure user is checkpoint owner or admin
  if (checkpoint.userId !== req.user.id && req.user.role !== 'admin') {
    return next(
      new ErrorResponse('Not authorized to update this checkpoint', 401)
    );
  }

  checkpoint = await prisma.checkpoint.update({
    where: { id: parseInt(req.params.id) },
    data: req.body
  });

  res.status(200).json({
    success: true,
    data: checkpoint
  });
});

// @desc    Delete checkpoint
// @route   DELETE /api/v1/checkpoints/:id
// @access  Private
exports.deleteCheckpoint = asyncHandler(async (req, res, next) => {
  const checkpoint = await prisma.checkpoint.findUnique({
    where: { id: parseInt(req.params.id) }
  });

  if (!checkpoint) {
    return next(
      new ErrorResponse(`Checkpoint not found with id of ${req.params.id}`, 404)
    );
  }

  // Make sure user is checkpoint owner or admin
  if (checkpoint.userId !== req.user.id && req.user.role !== 'admin') {
    return next(
      new ErrorResponse('Not authorized to delete this checkpoint', 401)
    );
  }

  await prisma.checkpoint.delete({
    where: { id: parseInt(req.params.id) }
  });

  res.status(200).json({
    success: true,
    data: {}
  });
});
