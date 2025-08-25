const { PrismaClient, Prisma } = require('@prisma/client');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/async');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const SessionManager = require('../utils/sessionManager');
const DeviceFingerprint = require('../utils/deviceFingerprint');

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
  errorFormat: 'pretty'
});

// Password validation regex
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

// @desc    Register a new user
// @route   POST /api/v1/auth/register
// @access  Public
exports.register = asyncHandler(async (req, res, next) => {
  const { name, email, password, role = 'user' } = req.body;

  // Input validation
  if (!name || !email || !password) {
    return next(ErrorResponse.validation('Please provide all required fields'));
  }

  // Validate email format
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return next(ErrorResponse.validation('Please provide a valid email'));
  }

  // Validate password strength
  if (!PASSWORD_REGEX.test(password)) {
    return next(ErrorResponse.validation(
      'Password must be at least 8 characters long and include at least one uppercase letter, one lowercase letter, one number, and one special character'
    ));
  }

  // Validate role
  if (!['user', 'admin'].includes(role)) {
    return next(ErrorResponse.validation('Invalid role specified'));
  }

  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true }
    });

    if (existingUser) {
      return next(ErrorResponse.validation('A user with this email already exists'));
    }

    // Create user
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: await bcrypt.hash(password, 12), // Increased salt rounds for better security
        role,
        isAdmin: role === 'admin'
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isAdmin: true,
        createdAt: true
      }
    });

    // Format response
    const userData = {
      ...user,
      role: user.role || 'user',
      isAdmin: user.isAdmin || user.role === 'admin'
    };

    // Send token response
    sendTokenResponse(userData, 201, res);
    
  } catch (error) {
    console.error('Registration error:', error);
    
    // Handle Prisma errors
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return next(ErrorResponse.validation('A user with this email already exists'));
      }
    }
    
    next(ErrorResponse.internal('Registration failed. Please try again later.'));
  }
});

// @desc    Login user
// @route   POST /api/v1/auth/login
// @access  Public
exports.login = asyncHandler(async (req, res, next) => {
  const { email, password, deviceApproved } = req.body;

  // Validate input
  if (!email || !password) {
    return next(ErrorResponse.validation('Please provide both email and password'));
  }

  // Validate email format
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return next(ErrorResponse.validation('Please provide a valid email'));
  }

  try {
    // Check for user
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        password: true,
        role: true,
        isAdmin: true,
        loginAttempts: true,
        lockUntil: true,
        isLocked: true,
        deviceApprovalRequired: true,
        maxDevices: true
      }
    });

    // Check if account is locked
    if (user?.lockUntil && user.lockUntil > new Date()) {
      const retryAfter = Math.ceil((user.lockUntil - new Date()) / 1000 / 60);
      return next(
        ErrorResponse.tooManyRequests(
          `Account temporarily locked. Try again in ${retryAfter} minutes.`,
          { retryAfter: Math.ceil(retryAfter * 60) }
        )
      );
    }

    // Check if account is permanently locked
    if (user?.isLocked) {
      return next(
        ErrorResponse.forbidden(
          'Account has been locked due to multiple device login attempts. Please contact support.'
        )
      );
    }

    // Check if user exists and password is correct
    if (!user || !(await bcrypt.compare(password, user.password))) {
      // Increment failed login attempts if user exists
      if (user) {
        await handleFailedLogin(user.id);
      }
      
      return next(ErrorResponse.unauthorized('Invalid email or password'));
    }

    // Check for existing active sessions if user requires device approval
    if (user.deviceApprovalRequired) {
      const activeSessions = await prisma.activeSession.findMany({
        where: {
          userId: user.id,
          isActive: true,
          expiresAt: { gt: new Date() }
        }
      });

      // If user has active sessions and hasn't approved this device
      if (activeSessions.length > 0 && !deviceApproved) {
        return res.status(200).json({
          success: false,
          requiresDeviceApproval: true,
          message: 'Device approval required. This application only allows login from one device at a time.'
        });
      }

      // If user has active sessions and tries to login from another device
      if (activeSessions.length > 0 && deviceApproved) {
         // validate if same device first
         const sameDevice = activeSessions.find(session => session.deviceId == req.body.deviceData.deviceId);
         if (!sameDevice) {
          // Lock the account
          await prisma.user.update({
            where: { id: user.id },
            data: {
              isLocked: true,
              lockUntil: null // Permanent lock
            }
          });
          
        // Deactivate all existing sessions
        await prisma.activeSession.updateMany({
          where: {
            userId: user.id,
            isActive: true
          },
          data: {
            isActive: false
          }
        });

        return next(
            ErrorResponse.forbidden(
              'Account has been locked due to attempted login from multiple devices. Please contact support.'
            )
          );
         }

      }

      // If user approved device usage, disable future approval requirements
      if (deviceApproved) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            deviceApprovalRequired: false
          }
        });
      }
    }

    // Reset login attempts on successful login
    await prisma.user.update({
      where: { id: user.id },
      data: {
        loginAttempts: 0,
        lockUntil: null,
        lastLogin: new Date()
      }
    });

    // Create or validate device session
    const deviceData = req.body.deviceData || {};
    const sessionResult = await SessionManager.createOrValidateSession(user.id, req, deviceData);
    
    if (!sessionResult.success) {
      return next(ErrorResponse.internal(`Session creation failed: ${sessionResult.error}`));
    }

    // Prepare user data for response
    const userData = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role || 'user',
      isAdmin: user.isAdmin || user.role === 'admin'
    };

    // Send token response with device session info
    sendTokenResponse(userData, 200, res, sessionResult);
    
  } catch (error) {
    console.error('Login error:', error);
    next(ErrorResponse.internal('Login failed. Please try again later.'));
  }
});

/**
 * Handle failed login attempts and lock account if necessary
 * @param {number} userId - The ID of the user
 */
async function handleFailedLogin(userId) {
  const MAX_LOGIN_ATTEMPTS = 5;
  const LOCK_TIME = 15 * 60 * 1000; // 15 minutes in milliseconds
  
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { loginAttempts: true }
    });
    
    const attempts = (user?.loginAttempts || 0) + 1;
    const updates = { loginAttempts: attempts };
    
    // Lock the account if max attempts reached
    if (attempts >= MAX_LOGIN_ATTEMPTS) {
      updates.lockUntil = new Date(Date.now() + LOCK_TIME);
    }
    
    await prisma.user.update({
      where: { id: userId },
      data: updates
    });
    
  } catch (error) {
    console.error('Failed to update login attempts:', error);
  }
}

// @desc    Get current logged in user
// @route   GET /api/v1/auth/me
// @access  Private
exports.getMe = asyncHandler(async (req, res, next) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isAdmin: true,
      createdAt: true
    }
  });

  if (!user) {
    return next(ErrorResponse.notFound('User not found'));
  }

  res.status(200).json({
    success: true,
    data: user
  });
});

// @desc    Update user details
// @route   PUT /api/v1/auth/updatedetails
// @access  Private
exports.updateDetails = asyncHandler(async (req, res, next) => {
  const fieldsToUpdate = {
    name: req.body.name,
    email: req.body.email
  };

  // Remove undefined fields
  Object.keys(fieldsToUpdate).forEach(key => 
    fieldsToUpdate[key] === undefined && delete fieldsToUpdate[key]
  );

  if (Object.keys(fieldsToUpdate).length === 0) {
    return next(ErrorResponse.validation('Please provide fields to update'));
  }

  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: fieldsToUpdate,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isAdmin: true
    }
  });

  res.status(200).json({
    success: true,
    data: user
  });
});

// @desc    Update password
// @route   PUT /api/v1/auth/updatepassword
// @access  Private
exports.updatePassword = asyncHandler(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return next(ErrorResponse.validation('Please provide current and new password'));
  }

  // Get user with password
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      id: true,
      password: true
    }
  });

  if (!user) {
    return next(ErrorResponse.notFound('User not found'));
  }

  // Check current password
  const isMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isMatch) {
    return next(ErrorResponse.unauthorized('Current password is incorrect'));
  }

  // Update password
  const hashedPassword = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: req.user.id },
    data: { password: hashedPassword }
  });

  sendTokenResponse({ id: user.id }, 200, res);
});

// @desc    Forgot password
// @route   POST /api/v1/auth/forgotpassword
// @access  Public
exports.forgotPassword = asyncHandler(async (req, res, next) => {
  const { email } = req.body;

  if (!email) {
    return next(ErrorResponse.validation('Please provide an email'));
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true }
  });

  if (!user) {
    return res.status(200).json({
      success: true,
      message: 'If an account with that email exists, a reset link has been sent'
    });
  }

  // Generate reset token
  const resetToken = crypto.randomBytes(20).toString('hex');
  const resetTokenExpire = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  await prisma.user.update({
    where: { id: user.id },
    data: {
      resetToken,
      resetTokenExpire
    }
  });

  // In a real app, you would send an email with the reset link
  const resetUrl = `${req.protocol}://${req.get('host')}/api/v1/auth/resetpassword/${resetToken}`;
  
  // For development, log the reset URL
  console.log('Reset URL:', resetUrl);

  res.status(200).json({
    success: true,
    message: 'If an account with that email exists, a reset link has been sent'
  });
});

// @desc    Reset password
// @route   PUT /api/v1/auth/resetpassword/:resettoken
// @access  Public
exports.resetPassword = asyncHandler(async (req, res, next) => {
  const { password } = req.body;
  const resetToken = req.params.resettoken;

  if (!password) {
    return next(ErrorResponse.validation('Please provide a new password'));
  }

  // Hash the reset token to match the one in the database
  const hashedToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  // Find user by reset token and check if it's not expired
  const user = await prisma.user.findFirst({
    where: {
      resetToken: hashedToken,
      resetTokenExpire: { gt: new Date() }
    }
  });

  if (!user) {
    return next(ErrorResponse.badRequest('Invalid or expired token'));
  }

  // Update password and clear reset token
  const hashedPassword = await bcrypt.hash(password, 12);
  
  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
      resetToken: null,
      resetTokenExpire: null
    }
  });

  res.status(200).json({
    success: true,
    message: 'Password reset successful. You can now login with your new password.'
  });
});

// @desc    Log user out / clear cookie
// @route   POST /api/v1/auth/logout
// @access  Private
exports.logout = asyncHandler(async (req, res, next) => {
  res.cookie('token', 'none', {
    expires: new Date(Date.now() + 10 * 1000), // 10 seconds
    httpOnly: true
  });

  res.status(200).json({
    success: true,
    data: {}
  });
});

// Get token from model, create cookie and send response
const sendTokenResponse = (user, statusCode, res, sessionResult = null) => {
  // Create token
  const token = jwt.sign(
    { 
      id: user.id,
      role: user.role || 'user',
      isAdmin: user.isAdmin || user.role === 'admin'
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE }
  );

  // Cookie options
  const cookieOptions = {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRE * 24 * 60 * 60 * 1000
    ),
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    domain: process.env.NODE_ENV === 'production' ? '.yourapp.com' : 'localhost'
  };

  // Set cookie
  res.cookie('token', token, cookieOptions);

  // Remove sensitive data from user object
  const userResponse = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role || 'user',
    isAdmin: user.isAdmin || user.role === 'admin'
  };

  // Prepare response data
  const responseData = {
    success: true,
    token, // Still send token in response for clients that need it
    user: userResponse
  };

  // Add device session information if available
  if (sessionResult) {
    responseData.deviceSession = {
      deviceId: sessionResult.session.deviceId,
      deviceName: sessionResult.session.deviceName,
      isNewDevice: sessionResult.isNewDevice,
      expiresAt: sessionResult.session.expiresAt
    };
    
    // Add warnings if devices were locked
    if (sessionResult.lockedDevices && sessionResult.lockedDevices.length > 0) {
      responseData.warnings = {
        lockedDevices: sessionResult.lockedDevices.map(device => ({
          deviceName: device.deviceName,
          lastActivity: device.lastActivity
        }))
      };
    }
  }

  // Send response
  res.status(statusCode).json(responseData);
};
