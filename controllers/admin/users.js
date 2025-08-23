const { PrismaClient } = require('@prisma/client');
const ErrorResponse = require('../../utils/errorResponse');
const asyncHandler = require('../../middleware/async');

const prisma = new PrismaClient();

// @desc    Get all users
// @route   GET /api/v1/admin/users
// @access  Private/Admin
exports.getUsers = asyncHandler(async (req, res, next) => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isLocked: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  res.status(200).json({
    success: true,
    count: users.length,
    data: users,
  });
});

// @desc    Get single user
// @route   GET /api/v1/admin/users/:id
// @access  Private/Admin
exports.getUser = asyncHandler(async (req, res, next) => {
  const user = await prisma.user.findUnique({
    where: {
      id: parseInt(req.params.id),
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isLocked: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!user) {
    return next(
      new ErrorResponse(`User not found with id of ${req.params.id}`, 404)
    );
  }

  res.status(200).json({
    success: true,
    data: user,
  });
});

// @desc    Delete user
// @route   DELETE /api/v1/admin/users/:id
// @access  Private/Admin
exports.deleteUser = asyncHandler(async (req, res, next) => {
  // Prevent deleting your own account
  if (req.params.id === req.user.id) {
    return next(
      new ErrorResponse('You cannot delete your own account', 400)
    );
  }

  const user = await prisma.user.findUnique({
    where: {
      id: req.params.id,
    },
  });

  if (!user) {
    return next(
      new ErrorResponse(`User not found with id of ${req.params.id}`, 404)
    );
  }

  // Delete related records first (FileAccess, Checkpoints, etc.)
  await prisma.$transaction([
    prisma.fileAccess.deleteMany({
      where: { userId: req.params.id },
    }),
    prisma.checkpoint.deleteMany({
      where: { userId: req.params.id },
    }),
  ]);

  // Then delete the user
  await prisma.user.delete({
    where: {
      id: req.params.id,
    },
  });

  res.status(200).json({
    success: true,
    data: {},
  });
});

// @desc    Get user count
// @route   GET /api/v1/admin/users/count
// @access  Private/Admin
exports.getUserCount = asyncHandler(async (req, res, next) => {
  const count = await prisma.user.count();

  res.status(200).json({
    success: true,
    data: { count },
  });
});
