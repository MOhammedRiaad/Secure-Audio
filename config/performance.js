/**
 * Performance and Storage Configuration
 * 
 * This file contains configuration options for optimizing
 * large file handling and chapter storage strategies.
 * 
 * OPTIMIZED FOR 2GB SERVER
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

  // Chapter storage strategy - OPTIMIZED FOR LOW MEMORY
  chapters: {
    // Storage thresholds - Force filesystem storage to avoid DB memory issues
    databaseStorageThreshold: 1 * 1024 * 1024, // Store in DB only if under 1MB
    filesystemStorageThreshold: 1 * 1024 * 1024, // Use filesystem for anything over 1MB
    
    // Default storage type: Force filesystem for 2GB server
    defaultStorageType: 'filesystem',
    
    // Chapter processing settings - SINGLE THREADED for memory safety
    maxConcurrentChapters: 1, // Force single-threaded processing
    processingTimeout: parseInt(process.env.CHAPTER_PROCESSING_TIMEOUT) || 600000, // 10 minutes
    
    // Storage paths
    chapterStoragePath: process.env.CHAPTER_STORAGE_PATH || 'chapters',
    tempPath: process.env.TEMP_PATH || 'temp',
    
    // Memory optimization settings
    enableStreamingProcessing: true, // Use streaming instead of memory buffers
    maxMemoryPerChapter: 50 * 1024 * 1024, // 50MB max memory per chapter
    cleanupTempFiles: true, // Clean up temporary files immediately
  },

  // Encryption settings
  encryption: {
    algorithm: 'aes-256-gcm',
    ivLength: 12, // 96-bit IV for GCM
    tagLength: 16, // 128-bit authentication tag
    keyLength: 32, // 256-bit key
  },

  // Streaming optimizations - OPTIMIZED FOR LOW MEMORY
  streaming: {
    chunkSize: 32 * 1024, // 32KB (reduced from 64KB)
    highWaterMark: 8 * 1024, // 8KB buffer (reduced from 16KB)
    enableRangeRequests: false, // Disabled for encrypted content
    cacheHeaders: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  },

  // FFmpeg settings - OPTIMIZED FOR LOW MEMORY
  ffmpeg: {
    timeout: 600000, // 10 minutes (increased for large files)
    maxBuffer: 50 * 1024 * 1024, // 50MB (reduced from 200MB)
    args: {
      inputFormat: 'mp3',
      outputFormat: 'mp3',
      copyCodec: true, // Use copy codec when possible
      avoidNegativeTs: 'make_zero',
    },
  },

  // Memory management - AGGRESSIVE FOR 2GB SERVER
  memory: {
    maxBufferSize: 50 * 1024 * 1024, // 50MB max buffer (reduced from 100MB)
    gcThreshold: 100 * 1024 * 1024, // Trigger GC at 100MB (reduced from 500MB)
    enableGcHints: true,
    aggressiveCleanup: true, // Enable aggressive memory cleanup
    maxHeapUsage: 1500 * 1024 * 1024, // 1.5GB max heap usage
  },

  // Logging and monitoring
  monitoring: {
    logLargeOperations: true,
    largeOperationThreshold: 25 * 1024 * 1024, // 25MB (reduced from 50MB)
    enablePerformanceMetrics: process.env.NODE_ENV === 'development',
    logStreamingStats: true,
    logMemoryUsage: true, // Log memory usage during operations
  },
};