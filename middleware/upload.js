const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create uploads directory if it doesn't exist
const uploadDir = process.env.FILE_UPLOAD_PATH || './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Set up storage for uploaded files
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Create a unique filename with original extension
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

// File filter to only allow audio files
const fileFilter = (req, file, cb) => {
  // Accept audio files only
  if (!file.mimetype.startsWith('audio/')) {
    return cb(new Error('Only audio files are allowed!'), false);
  }
  cb(null, true);
};

// Configure multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_UPLOAD) || 10 * 1024 * 1024, // 10MB default
    fieldSize: 100 * 1024 * 1024, // 100MB for field data
    files: 2, // Maximum number of files
    parts: 8 // Maximum number of parts
  },
  // Add timeout handling for large files
  preservePath: false,
  // Custom error handling for timeouts
  onError: (err, next) => {
    if (err.code === 'LIMIT_FILE_SIZE') {
      err.message = 'File too large. Maximum size is ' + (parseInt(process.env.MAX_FILE_UPLOAD) / (1024 * 1024 * 1024)).toFixed(1) + 'GB';
    }
    next(err);
  }
});

module.exports = upload;
