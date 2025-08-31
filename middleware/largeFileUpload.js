const asyncHandler = require('./async');

// Middleware to handle large file uploads with proper timeout and connection management
const largeFileUploadHandler = asyncHandler(async (req, res, next) => {
  // Set extended timeout for large file uploads
  req.setTimeout(15 * 60 * 1000); // 15 minutes
  res.setTimeout(15 * 60 * 1000); // 15 minutes
  
  // Set keep-alive headers
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Keep-Alive', 'timeout=600, max=1000');
  
  // Disable request timeout for large uploads
  req.connection.setTimeout(0);
  
  // Handle connection errors
  req.on('error', (err) => {
    console.error('Request error during large file upload:', err);
  });
  
  res.on('error', (err) => {
    console.error('Response error during large file upload:', err);
  });
  
  // Handle client disconnect
  req.on('close', () => {
    console.log('Client disconnected during file upload');
  });
  
  next();
});

module.exports = largeFileUploadHandler;