const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create covers directory if it doesn't exist
const coversDir = './covers';
if (!fs.existsSync(coversDir)) {
  fs.mkdirSync(coversDir, { recursive: true });
}

// Set up storage for cover images
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, coversDir);
  },
  filename: function (req, file, cb) {
    // Create a unique filename with original extension
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'cover-' + uniqueSuffix + ext);
  }
});

// File filter to only allow image files
const imageFilter = (req, file, cb) => {
  // Accept image files only
  if (!file.mimetype.startsWith('image/')) {
    return cb(new Error('Only image files are allowed for covers!'), false);
  }
  
  // Check for supported image formats
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  if (!allowedTypes.includes(file.mimetype)) {
    return cb(new Error('Only JPEG, PNG, GIF, and WebP images are allowed!'), false);
  }
  
  cb(null, true);
};

// Configure multer for image uploads
const imageUpload = multer({
  storage: storage,
  fileFilter: imageFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit for images
  }
});

// Memory storage for base64 conversion
const memoryStorage = multer.memoryStorage();

const imageUploadMemory = multer({
  storage: memoryStorage,
  fileFilter: imageFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit for images
  }
});

// Utility function to convert buffer to base64
const bufferToBase64 = (buffer, mimetype) => {
  return `data:${mimetype};base64,${buffer.toString('base64')}`;
};

module.exports = {
  imageUpload,
  imageUploadMemory,
  bufferToBase64
};