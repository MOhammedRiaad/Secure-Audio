const rateLimit = require('express-rate-limit');
const ErrorResponse = require('../utils/errorResponse');

// Rate limiting for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 requests per windowMs
  message: 'Too many login attempts from this IP, please try again after 15 minutes',
  trustProxy: 1,
  handler: (req, res, next, options) => {
    const error = ErrorResponse.tooManyRequests(
      options.message,
      { 
        retryAfter: Math.ceil(options.windowMs / 1000),
        ip: req.headers['x-real-ip'] || req.socket?.remoteAddress || req.ip
      }
    );
    error.send(res);
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  // Use a stable key regardless of X-Forwarded-For quirks
  keyGenerator: (req, res) => req.headers['x-real-ip'] || req.socket?.remoteAddress || req.ip,
});

// Rate limiting for API routes
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again after 15 minutes',
  trustProxy: 1,
  standardHeaders: true,
  legacyHeaders: false,
  // Use a stable key regardless of X-Forwarded-For quirks
  keyGenerator: (req, res) => req.headers['x-real-ip'] || req.socket?.remoteAddress || req.ip,
});

// Rate limiting for sensitive operations (e.g., password reset)
const sensitiveOperationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // limit each IP to 5 requests per hour
  message: 'Too many attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  authLimiter,
  apiLimiter,
  sensitiveOperationLimiter
};
