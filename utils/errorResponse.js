class ErrorResponse extends Error {
  /**
   * Create a new error response
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code
   * @param {Object} [details] - Additional error details
   * @param {string} [code] - Error code for programmatic handling
   */
  constructor(message, statusCode, details = null, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.code = code || this.constructor.name;
    this.timestamp = new Date().toISOString();
    
    // Capture stack trace, excluding constructor call from it
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Create a validation error response
   * @param {Object} errors - Validation errors (e.g., from express-validator)
   * @returns {ErrorResponse}
   */
  static validation(errors) {
    return new ErrorResponse(
      'Validation failed',
      400,
      { errors },
      'VALIDATION_ERROR'
    );
  }

  /**
   * Create a not found error response
   * @param {string} resource - Name of the resource not found
   * @returns {ErrorResponse}
   */
  static notFound(resource = 'Resource') {
    return new ErrorResponse(
      `${resource} not found`,
      404,
      null,
      'NOT_FOUND'
    );
  }

  /**
   * Create an unauthorized error response
   * @param {string} message - Custom message
   * @returns {ErrorResponse}
   */
  static unauthorized(message = 'Not authorized to access this resource') {
    return new ErrorResponse(
      message,
      401,
      null,
      'UNAUTHORIZED'
    );
  }

  /**
   * Create a forbidden error response
   * @param {string} message - Custom message
   * @returns {ErrorResponse}
   */
  static forbidden(message = 'Access to this resource is forbidden') {
    return new ErrorResponse(
      message,
      403,
      null,
      'FORBIDDEN'
    );
  }

  /**
   * Create a too many requests error response
   * @param {string} message - Custom message
   * @param {Object} [details] - Additional details
   * @returns {ErrorResponse}
   */
  static tooManyRequests(message = 'Too many requests', details = null) {
    return new ErrorResponse(
      message,
      429,
      details,
      'TOO_MANY_REQUESTS'
    );
  }

  /**
   * Create an internal server error response
   * @param {string} [message] - Custom message
   * @returns {ErrorResponse}
   */
  static internal(message = 'Internal Server Error') {
    return new ErrorResponse(
      message,
      500,
      null,
      'INTERNAL_SERVER_ERROR'
    );
  }

  /**
   * Convert error to JSON response format
   * @returns {Object}
   */
  toJSON() {
    return {
      success: false,
      error: {
        message: this.message,
        code: this.code,
        statusCode: this.statusCode,
        timestamp: this.timestamp,
        ...(this.details && { details: this.details })
      }
    };
  }

  /**
   * Send error response in Express middleware
   * @param {Response} res - Express response object
   */
  send(res) {
    // Set rate limiting headers if this is a rate limiting error
    if (this.statusCode === 429) {
      const retryAfter = this.details?.retryAfter;
      if (retryAfter) {
        res.set('Retry-After', String(retryAfter));
      }
      
      // Add rate limit headers
      res.set({
        'X-RateLimit-Limit': '5',
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': Math.floor((Date.now() + (retryAfter * 1000)) / 1000)
      });
    }
    
    // Send the error response
    res.status(this.statusCode).json(this.toJSON());
  }
}

module.exports = ErrorResponse;
