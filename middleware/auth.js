const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const ErrorResponse = require('../utils/errorResponse');

const prisma = new PrismaClient();

// Protect routes - verifies user is authenticated
exports.protect = async (req, res, next) => {
  let token;
  let tokenSource = 'none';

  // Check for token in Authorization header first
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
    tokenSource = 'header';
  } 
  // Then check cookies
  else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
    tokenSource = 'cookie';
  }
  // Check for token in query params (as fallback)
  else if (req.query && req.query.token) {
    token = req.query.token;
    tokenSource = 'query';
  }

  console.log(`Token source: ${tokenSource}, Token present: ${!!token}`);

  // Make sure token exists
  if (!token) {
    console.error('No token provided in request');
    return next(new ErrorResponse('Not authorized to access this route - no token provided', 401));
  }

  try {
    console.log('Verifying token...');
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Token decoded successfully:', { id: decoded.id, role: decoded.role });
    
    if (!decoded.id) {
      console.error('Token missing user ID');
      return next(new ErrorResponse('Invalid token - missing user ID', 401));
    }

    // Get user with role information
    console.log('Fetching user from database...');
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isAdmin: true,
        isLocked: true,
        loginAttempts: true,
        lockUntil: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!user) {
      console.error('No user found for token ID:', decoded.id);
      return next(new ErrorResponse('No user found with this ID', 404));
    }

    // Check if account is locked (either by isLocked flag or temporary lockUntil)
    if (user.isLocked || (user.lockUntil && user.lockUntil > new Date())) {
      console.error('Account is locked for user:', user.id);
      
      // If temporary lock has expired, clear it
      if (user.lockUntil && user.lockUntil <= new Date()) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            lockUntil: null,
            loginAttempts: 0
          }
        });
        console.log('Temporary lock expired and cleared for user:', user.id);
      } else {
        return next(new ErrorResponse('Account is locked. Please try again later.', 401));
      }
    }

    console.log('User authenticated successfully:', { id: user.id, email: user.email, role: user.role });
    
    // Add user to request object
    req.user = user;
    next();
  } catch (err) {
    console.error('Token verification failed:', {
      name: err.name,
      message: err.message,
      expiredAt: err.expiredAt,
      stack: err.stack
    });
    
    if (err.name === 'TokenExpiredError') {
      return next(new ErrorResponse('Session expired. Please log in again.', 401));
    }
    
    console.error('Auth error:', err);
    if (err.name === 'JsonWebTokenError') {
      return next(new ErrorResponse('Invalid token', 401));
    } else if (err.name === 'TokenExpiredError') {
      return next(new ErrorResponse('Token expired', 401));
    }
    return next(new ErrorResponse('Not authorized to access this route', 401));
  }
};

// Grant access to specific roles
exports.authorize = (...roles) => {
  return (req, res, next) => {
    // If no roles specified, only allow admin
    if (roles.length === 0) {
      roles = ['admin'];
    }
    
    // Check if user has one of the required roles or is an admin
    const hasRole = roles.includes(req.user.role) || 
                   (req.user.isAdmin && roles.includes('admin')) ||
                   (req.user.role === 'admin' && roles.includes('admin'));
    
    if (!hasRole) {
      return next(
        new ErrorResponse(
          `User role ${req.user.role} is not authorized to access this route`,
          403
        )
      );
    }
    next();
  };
};
