const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
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
  // Use a stable key regardless of X-Forwarded-For quirks with IPv6 support
  keyGenerator: (req, res) => {
    const ip = req.headers['x-real-ip'] || req.socket?.remoteAddress || req.ip;
    return ipKeyGenerator(ip);
  },
});

// Rate limiting for API routes
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again after 15 minutes',
  trustProxy: 1,
  standardHeaders: true,
  legacyHeaders: false,
  // Use a stable key regardless of X-Forwarded-For quirks with IPv6 support
  keyGenerator: (req, res) => {
    const ip = req.headers['x-real-ip'] || req.socket?.remoteAddress || req.ip;
    return ipKeyGenerator(ip);
  },
});

// Rate limiting for sensitive operations (e.g., password reset)
const sensitiveOperationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // limit each IP to 5 requests per hour
  message: 'Too many attempts, please try again later',
  trustProxy: 1,
  standardHeaders: true,
  legacyHeaders: false,
  // Use IPv6-safe key generation
  keyGenerator: (req, res) => {
    const ip = req.headers['x-real-ip'] || req.socket?.remoteAddress || req.ip;
    return ipKeyGenerator(ip);
  },
});

// Rate limiting for streaming operations (more permissive for large files)
const streamingLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 50, // Allow more requests for streaming large files
  message: 'Too many streaming requests, please try again later',
  trustProxy: 1,
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting for authenticated streaming sessions
  skip: (req, res) => {
    // Allow unlimited requests for valid streaming sessions
    const sessionToken = req.params.sessionToken || req.params.token;
    return sessionToken && sessionToken.length > 20; // Basic session token validation
  },
  // Use IPv6-safe key generation
  keyGenerator: (req, res) => {
    const ip = req.headers['x-real-ip'] || req.socket?.remoteAddress || req.ip;
    return ipKeyGenerator(ip);
  },
});

// Rate limiting for file uploads (very permissive for large file uploads)
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Allow 10 uploads per hour per IP
  message: 'Too many upload attempts, please try again later',
  trustProxy: 1,
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting for authenticated admin users
  skip: (req, res) => {
    // Allow unlimited uploads for authenticated admin users
    return req.user && req.user.role === 'admin';
  },
  // Use IPv6-safe key generation
  keyGenerator: (req, res) => {
    const ip = req.headers['x-real-ip'] || req.socket?.remoteAddress || req.ip;
    return ipKeyGenerator(ip);
  },
});

module.exports = {
  authLimiter,
  apiLimiter,
  sensitiveOperationLimiter,
  streamingLimiter,
  uploadLimiter
};
