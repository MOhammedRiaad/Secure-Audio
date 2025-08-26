/**
 * Performance and Storage Configuration
 * 
 * This file contains configuration options for optimizing
 * large file handling and chapter storage strategies.
 */

module.exports = {
  // File upload limits
  upload: {
    maxFileSize: parseInt(process.env.MAX_FILE_UPLOAD) || 2 * 1024 * 1024 * 1024, // 2GB
    maxFieldSize: 100 * 1024 * 1024, // 100MB
    maxFiles: 2,
    maxParts: 200,
    chunkSize: 64 * 1024, // 64KB chunks for streaming
  },

  // Chapter storage strategy
  chapters: {
    // Storage thresholds
    databaseStorageThreshold: 10 * 1024 * 1024, // Store in DB if under 10MB
    filesystemStorageThreshold: 50 * 1024 * 1024, // Use streaming if over 50MB
    
    // Default storage type: 'database' or 'filesystem'
    defaultStorageType: process.env.CHAPTER_STORAGE_TYPE || 'filesystem',
    
    // Chapter processing settings
    maxConcurrentChapters: parseInt(process.env.MAX_CONCURRENT_CHAPTERS) || 3,
    processingTimeout: parseInt(process.env.CHAPTER_PROCESSING_TIMEOUT) || 300000, // 5 minutes
    
    // Storage paths
    chapterStoragePath: process.env.CHAPTER_STORAGE_PATH || 'chapters',
    tempPath: process.env.TEMP_PATH || 'temp',
  },

  // Encryption settings
  encryption: {
    algorithm: 'aes-256-gcm',
    ivLength: 12, // 96-bit IV for GCM
    tagLength: 16, // 128-bit authentication tag
    keyLength: 32, // 256-bit key
  },

  // Streaming optimizations
  streaming: {
    chunkSize: 64 * 1024, // 64KB
    highWaterMark: 16 * 1024, // 16KB buffer
    enableRangeRequests: false, // Disabled for encrypted content
    cacheHeaders: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  },

  // FFmpeg settings
  ffmpeg: {
    timeout: 300000, // 5 minutes
    maxBuffer: 200 * 1024 * 1024, // 200MB
    args: {
      inputFormat: 'mp3',
      outputFormat: 'mp3',
      copyCodec: true, // Use copy codec when possible
      avoidNegativeTs: 'make_zero',
    },
  },

  // Memory management
  memory: {
    maxBufferSize: 100 * 1024 * 1024, // 100MB max buffer
    gcThreshold: 500 * 1024 * 1024, // Trigger GC at 500MB
    enableGcHints: true,
  },

  // Logging and monitoring
  monitoring: {
    logLargeOperations: true,
    largeOperationThreshold: 50 * 1024 * 1024, // 50MB
    enablePerformanceMetrics: process.env.NODE_ENV === 'development',
    logStreamingStats: true,
  },
};