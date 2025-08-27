const { PrismaClient } = require('@prisma/client');
const ErrorResponse = require('../../utils/errorResponse');
const asyncHandler = require('../../middleware/async');
const bcrypt = require('bcryptjs');

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

// @desc    Create user
// @route   POST /api/v1/admin/users
// @access  Private/Admin
exports.createUser = asyncHandler(async (req, res, next) => {
  const { name, email, password, role } = req.body;

  // Validate required fields
  if (!name || !email || !password) {
    return next(new ErrorResponse('Please provide name, email, and password', 400));
  }

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    return next(new ErrorResponse('User with this email already exists', 400));
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 12);

  // Create user
  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      role: role || 'user',
      isAdmin: role === 'admin',
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

  res.status(201).json({
    success: true,
    data: user,
  });
});

// @desc    Update user
// @route   PUT /api/v1/admin/users/:id
// @access  Private/Admin
exports.updateUser = asyncHandler(async (req, res, next) => {
  const { name, email, role, isLocked } = req.body;
  const userId = parseInt(req.params.id);

  // Check if user exists
  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!existingUser) {
    return next(new ErrorResponse(`User not found with id of ${req.params.id}`, 404));
  }

  // Check if email is being changed and if it's already taken
  if (email && email !== existingUser.email) {
    const emailExists = await prisma.user.findUnique({
      where: { email },
    });

    if (emailExists) {
      return next(new ErrorResponse('User with this email already exists', 400));
    }
  }

  // Prepare update data
  const updateData = {};
  if (name !== undefined) updateData.name = name;
  if (email !== undefined) updateData.email = email;
  if (role !== undefined) {
    updateData.role = role;
    updateData.isAdmin = role === 'admin';
  }
  if (isLocked !== undefined) updateData.isLocked = isLocked;

  // Update user
  const user = await prisma.user.update({
    where: { id: userId },
    data: updateData,
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
      id: parseInt(req.params.id),
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

// @desc    Unlock user
// @route   PATCH /api/v1/admin/users/:id/unlock
// @access  Private/Admin
exports.unlockUser = asyncHandler(async (req, res, next) => {
  const user = await prisma.user.findUnique({
    where: {
      id: parseInt(req.params.id),
    },
  });

  if (!user) {
    return next(
      new ErrorResponse(`User not found with id of ${req.params.id}`, 404)
    );
  }

  if (!user.isLocked) {
    return next(
      new ErrorResponse('User is not locked', 400)
    );
  }

  // Unlock the user
  const updatedUser = await prisma.user.update({
    where: {
      id: parseInt(req.params.id),
    },
    data: {
      isLocked: false,
      lockUntil: null,
      loginAttempts: 0,
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

  res.status(200).json({
    success: true,
    data: updatedUser,
  });
});

// @desc    Get user sessions
// @route   GET /api/v1/admin/users/:id/sessions
// @access  Private/Admin
exports.getUserSessions = asyncHandler(async (req, res, next) => {
  const userId = parseInt(req.params.id);

  // Check if user exists
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  const sessions = await prisma.activeSession.findMany({
    where: {
      userId: userId,
      isActive: true,
    },
    orderBy: {
      lastActivity: 'desc',
    },
  });

  res.status(200).json({
    success: true,
    count: sessions.length,
    data: sessions,
  });
});

// @desc    Terminate user session
// @route   DELETE /api/v1/admin/users/:id/sessions/:sessionId
// @access  Private/Admin
exports.terminateUserSession = asyncHandler(async (req, res, next) => {
  const userId = parseInt(req.params.id);
  const sessionId = req.params.sessionId;

  // Check if user exists
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  // Find and deactivate the session
  const session = await prisma.activeSession.findFirst({
    where: {
      id: sessionId,
      userId: userId,
      isActive: true,
    },
  });

  if (!session) {
    return next(new ErrorResponse('Session not found or already terminated', 404));
  }

  await prisma.activeSession.update({
    where: { id: sessionId },
    data: { isActive: false },
  });

  res.status(200).json({
    success: true,
    message: 'Session terminated successfully',
  });
});

// @desc    Get users with session counts
// @route   GET /api/v1/admin/users/with-sessions
// @access  Private/Admin
exports.getUsersWithSessions = asyncHandler(async (req, res, next) => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isLocked: true,
      createdAt: true,
      updatedAt: true,
      activeSessions: {
        where: {
          isActive: true,
        },
        select: {
          id: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  // Transform data to include session count and multi-session flag
  const usersWithSessionInfo = users.map(user => ({
    ...user,
    sessionCount: user.activeSessions.length,
    hasMultipleSessions: user.activeSessions.length > 1,
    activeSessions: undefined, // Remove the sessions array from response
  }));

  res.status(200).json({
    success: true,
    count: usersWithSessionInfo.length,
    data: usersWithSessionInfo,
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
