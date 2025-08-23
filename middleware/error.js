const ErrorResponse = require('../utils/errorResponse');

/**
 * Error handling middleware for Express
 * Handles various types of errors and sends appropriate responses
 */
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;
  error.stack = err.stack;

  // Log to console for development
  console.error('🔴 Error Handler:', {
    message: err.message,
    statusCode: err.statusCode,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    name: err.name,
    code: err.code,
  });

  // Handle different types of errors
  switch (true) {
    // Handle JWT errors
    case err.name === 'JsonWebTokenError':
      error = ErrorResponse.unauthorized('Invalid token');
      break;
      
    case err.name === 'TokenExpiredError':
      error = ErrorResponse.unauthorized('Token expired');
      break;
      
    // Handle Prisma errors
    case err.code === 'P2002': // Unique constraint violation
      error = ErrorResponse.validation({
        [err.meta.target[0]]: 'This value is already in use'
      });
      break;
      
    case err.code === 'P2025': // Record not found
      error = ErrorResponse.notFound('The requested resource was not found');
      break;
      
    // Handle validation errors
    case err.name === 'ValidationError':
      const messages = Object.values(err.errors).map(val => val.message);
      error = ErrorResponse.validation(messages);
      break;
      
    // Handle duplicate key errors
    case err.code === 11000:
      const field = Object.keys(err.keyValue)[0];
      error = ErrorResponse.validation({
        [field]: `This ${field} is already in use`
      });
      break;
      
    // Handle cast errors (invalid ObjectId, etc.)
    case err.name === 'CastError':
      error = ErrorResponse.notFound('Invalid ID format');
      break;
      
    // Default to 500 server error
    default:
      const statusCode = err.statusCode || 500;
      const message = err.message || 'Server Error';
      error = new ErrorResponse(message, statusCode, null, 'SERVER_ERROR');
  }

  // If headers have already been sent, delegate to the default Express error handler
  if (res.headersSent) {
    return next(err);
  }

  // Send the error response
  res.status(error.statusCode).json({
    success: false,
    error: {
      message: error.message,
      code: error.code || 'INTERNAL_SERVER_ERROR',
      ...(error.details && { details: error.details })
    },
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
  });
};

module.exports = errorHandler;
