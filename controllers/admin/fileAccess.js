const { PrismaClient } = require('@prisma/client');
const ErrorResponse = require('../../utils/errorResponse');
const asyncHandler = require('../../middleware/async');

const prisma = new PrismaClient();

// @desc    Get all file accesses for a specific file
// @route   GET /api/v1/admin/file-access/file/:fileId
// @access  Private/Admin
exports.getFileAccesses = asyncHandler(async (req, res, next) => {
  const { fileId } = req.params;

  const file = await prisma.audioFile.findUnique({
    where: { id: parseInt(fileId) },
    include: {
      fileAccesses: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
    },
  });

  if (!file) {
    return next(new ErrorResponse(`File not found with id of ${fileId}`, 404));
  }

  // Get all users to show in the access management UI
  const allUsers = await prisma.user.findMany({
    where: {
      id: {
        not: req.user.id, // Exclude current admin
      },
    },
    select: {
      id: true,
      name: true,
      email: true,
    },
  });

  res.status(200).json({
    success: true,
    data: {
      file,
      allUsers,
    },
  });
});

// @desc    Grant access to a file for a user
// @route   POST /api/v1/admin/file-access
// @access  Private/Admin
exports.grantFileAccess = asyncHandler(async (req, res, next) => {
  const { userId, fileId, expiresAt } = req.body;

  // Check if user exists
  const user = await prisma.user.findUnique({
    where: { id: parseInt(userId) },
  });

  if (!user) {
    return next(new ErrorResponse(`User not found with id of ${userId}`, 404));
  }

  // Check if file exists
  const file = await prisma.audioFile.findUnique({
    where: { id: parseInt(fileId) },
  });

  if (!file) {
    return next(new ErrorResponse(`File not found with id of ${fileId}`, 404));
  }

  // Check if access already exists
  const existingAccess = await prisma.fileAccess.findUnique({
    where: {
      userId_fileId: {
        userId: parseInt(userId),
        fileId: parseInt(fileId),
      },
    },
  });

  if (existingAccess) {
    return next(
      new ErrorResponse(
        'Access already granted to this user for the specified file',
        400
      )
    );
  }

  // Create file access
  const fileAccess = await prisma.fileAccess.create({
    data: {
      userId: parseInt(userId),
      fileId: parseInt(fileId),
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  res.status(201).json({
    success: true,
    data: fileAccess,
  });
});

// @desc    Update file access
// @route   PUT /api/v1/admin/file-access/:id
// @access  Private/Admin
exports.updateFileAccess = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { canView, expiresAt } = req.body;

  const fileAccess = await prisma.fileAccess.findUnique({
    where: { id: parseInt(id) },
  });

  if (!fileAccess) {
    return next(
      new ErrorResponse(`File access not found with id of ${id}`, 404)
    );
  }

  const updatedAccess = await prisma.fileAccess.update({
    where: { id: parseInt(id) },
    data: {
      canView,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  res.status(200).json({
    success: true,
    data: updatedAccess,
  });
});

// @desc    Revoke file access
// @route   DELETE /api/v1/admin/file-access/:id
// @access  Private/Admin
exports.revokeFileAccess = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const fileAccess = await prisma.fileAccess.findUnique({
    where: { id: parseInt(id) },
  });

  if (!fileAccess) {
    return next(
      new ErrorResponse(`File access not found with id of ${id}`, 404)
    );
  }

  await prisma.fileAccess.delete({
    where: { id: parseInt(id) },
  });

  res.status(200).json({
    success: true,
    data: {},
  });
});
