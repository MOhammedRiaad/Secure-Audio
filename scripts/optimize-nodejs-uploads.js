#!/usr/bin/env node

/**
 * Node.js Upload Optimization Script
 * 
 * This script optimizes the Node.js backend for handling large file uploads
 * by addressing timeout and memory issues that cause upstream connection closures.
 */

const fs = require('fs');
const path = require('path');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

const log = (message, color = 'green') => {
  console.log(`${colors[color]}[${new Date().toISOString()}] ${message}${colors.reset}`);
};

const error = (message) => {
  console.error(`${colors.red}[ERROR] ${message}${colors.reset}`);
};

const info = (message) => {
  console.log(`${colors.blue}[INFO] ${message}${colors.reset}`);
};

const warning = (message) => {
  console.log(`${colors.yellow}[WARNING] ${message}${colors.reset}`);
};

log('Starting Node.js upload optimization...');

// 1. Update audioFiles controller with timeout handling
const updateAudioFilesController = () => {
  log('Optimizing audioFiles controller for large file handling...');
  
  const controllerPath = path.join(__dirname, '..', 'controllers', 'audioFiles.js');
  
  if (!fs.existsSync(controllerPath)) {
    error(`Controller file not found: ${controllerPath}`);
    return false;
  }
  
  let content = fs.readFileSync(controllerPath, 'utf8');
  
  // Add timeout configuration for FFmpeg
  const ffmpegTimeoutFix = `
const getAudioDuration = async (filePath) => {
  if (ffmpegAvailable) {
    return new Promise((resolve, reject) => {
      // Set a timeout for FFmpeg operations to prevent hanging
      const timeout = setTimeout(() => {
        console.warn('FFmpeg duration extraction timed out, using fallback');
        resolve(0);
      }, 30000); // 30 second timeout
      
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        clearTimeout(timeout);
        if (err) {
          console.error('Error getting audio duration with ffmpeg:', err);
          // Fallback to 0 if ffmpeg fails
          resolve(0);
        } else {
          resolve(metadata.format.duration || 0);
        }
      });
    });
  }
  
  // Fallback: Return 0 if ffmpeg is not available
  return 0;
};`;
  
  // Replace the existing getAudioDuration function
  content = content.replace(
    /const getAudioDuration = async \(filePath\) => {[\s\S]*?};/,
    ffmpegTimeoutFix
  );
  
  // Add progress tracking and memory management to upload function
  const uploadOptimizations = `
  try {
    // Send immediate response to prevent Nginx timeout
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Transfer-Encoding': 'chunked'
    });
    
    // Send progress updates
    const sendProgress = (stage, progress = 0) => {
      const progressData = JSON.stringify({ stage, progress, timestamp: Date.now() });
      res.write(\`data: \${progressData}\\n\\n\`);
    };
    
    sendProgress('starting', 0);
    
    // Process cover image if provided
    if (coverFile) {
      sendProgress('processing_cover', 10);
      coverImageMimeType = coverFile.mimetype;
      
      // Check storage preference from request body
      const useBase64 = req.body.coverStorageType === 'base64';
      
      if (useBase64) {
        // Convert to base64 and remove the file
        const imageBuffer = fs.readFileSync(coverFile.path);
        coverImageBase64 = bufferToBase64(imageBuffer, coverFile.mimetype);
        fs.unlinkSync(coverFile.path); // Clean up the temporary file
      } else {
        // Use file path storage
        coverImagePath = path.basename(coverFile.path);
      }
    }
    
    sendProgress('extracting_duration', 30);
    
    // Get file duration using ffmpeg if available, otherwise use 0
    const duration = await getAudioDuration(uploadPath);
    
    sendProgress('encrypting', 50);
    
    // Encrypt the audio file at rest with progress tracking
    const encryptionResult = await drm.encryptAudioFile(uploadPath, encryptedPath);
    
    sendProgress('saving_metadata', 80);
    
    // Remove the original unencrypted file
    if (fs.existsSync(uploadPath)) {
      fs.unlinkSync(uploadPath);
    }
    
    // Create file in database with encryption metadata and cover image
    const audioFileRecord = await prisma.audioFile.create({
      data: {
        filename: audioFile.originalname,
        path: encryptedFileName,
        mimeType: audioFile.mimetype,
        size: audioFile.size,
        duration,
        title: req.body.title || path.parse(audioFile.originalname).name,
        description: req.body.description || null,
        isPublic: req.body.isPublic === 'true' || false,
        isEncrypted: true,
        encryptionKey: encryptionResult.key,
        encryptionIV: encryptionResult.iv,
        encryptionTag: encryptionResult.authTag,
        coverImagePath,
        coverImageBase64,
        coverImageMimeType
      }
    });
    
    sendProgress('completed', 100);
    
    // Send final response
    const finalResponse = JSON.stringify({
      success: true,
      data: {
        ...audioFileRecord,
        // Don't expose encryption keys in response
        encryptionKey: undefined,
        encryptionIV: undefined
      }
    });
    
    res.end(finalResponse);
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
    return;
  } catch (error) {`;
  
  // Find and replace the try block in uploadAudioFile
  const tryBlockRegex = /try {[\s\S]*?} catch \(error\) {/;
  if (tryBlockRegex.test(content)) {
    content = content.replace(tryBlockRegex, uploadOptimizations);
    info('Added upload progress tracking and memory management');
  } else {
    warning('Could not find upload try block to optimize');
  }
  
  // Write the updated content back
  fs.writeFileSync(controllerPath, content);
  log('Updated audioFiles controller with optimizations');
  
  return true;
};

// 2. Update DRM utility for better memory management
const updateDRMUtility = () => {
  log('Optimizing DRM utility for large file encryption...');
  
  const drmPath = path.join(__dirname, '..', 'utils', 'drm.js');
  
  if (!fs.existsSync(drmPath)) {
    error(`DRM file not found: ${drmPath}`);
    return false;
  }
  
  let content = fs.readFileSync(drmPath, 'utf8');
  
  // Add memory-efficient encryption with progress callbacks
  const optimizedEncryption = `
  // Encrypt audio file at rest with memory management
  async encryptAudioFile(inputPath, outputPath, progressCallback = null) {
    return new Promise((resolve, reject) => {
      const fileKey = this.generateFileKey();
      const iv = crypto.randomBytes(IV_LENGTH);
      
      const cipher = crypto.createCipheriv(ALGORITHM, fileKey, iv);
      const input = fs.createReadStream(inputPath, { highWaterMark: CHUNK_SIZE });
      const output = fs.createWriteStream(outputPath, { highWaterMark: CHUNK_SIZE });
      
      // Write metadata header (IV + encrypted file key)
      const encryptedFileKey = this.encryptData(fileKey);
      const header = Buffer.concat([
        Buffer.from('SADRM', 'utf8'), // Magic bytes
        Buffer.from([1]), // Version
        Buffer.from([iv.length]), // IV length
        iv,
        Buffer.from([encryptedFileKey.length]), // Encrypted key length
        Buffer.from(encryptedFileKey, 'hex')
      ]);
      
      output.write(header);
      
      let totalBytes = 0;
      let processedBytes = 0;
      
      // Get file size for progress tracking
      try {
        const stats = fs.statSync(inputPath);
        totalBytes = stats.size;
      } catch (err) {
        console.warn('Could not get file size for progress tracking');
      }
      
      // Track progress
      input.on('data', (chunk) => {
        processedBytes += chunk.length;
        if (progressCallback && totalBytes > 0) {
          const progress = Math.round((processedBytes / totalBytes) * 100);
          progressCallback(progress);
        }
      });
      
      // Set up timeout for large files
      const timeout = setTimeout(() => {
        input.destroy();
        output.destroy();
        reject(new Error('Encryption timeout - file too large or system overloaded'));
      }, 10 * 60 * 1000); // 10 minute timeout
      
      input.pipe(cipher).pipe(output);
      
      output.on('finish', () => {
        clearTimeout(timeout);
        resolve({ 
          key: fileKey.toString('hex'), 
          iv: iv.toString('hex'),
          authTag: cipher.getAuthTag().toString('hex')
        });
      });
      
      output.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
      
      input.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }`;
  
  // Replace the existing encryptAudioFile method
  const encryptMethodRegex = /async encryptAudioFile\(inputPath, outputPath\) {[\s\S]*?}\s*}/;
  if (encryptMethodRegex.test(content)) {
    content = content.replace(encryptMethodRegex, optimizedEncryption.trim() + '\n  }');
    info('Updated DRM encryption with memory management and timeouts');
  } else {
    warning('Could not find encryptAudioFile method to optimize');
  }
  
  // Write the updated content back
  fs.writeFileSync(drmPath, content);
  log('Updated DRM utility with optimizations');
  
  return true;
};

// 3. Create PM2 ecosystem configuration optimized for large uploads
const createOptimizedEcosystem = () => {
  log('Creating optimized PM2 ecosystem configuration...');
  
  const ecosystemConfig = {
    apps: [{
      name: 'secure-audio-api',
      script: 'server.js',
      instances: 1, // Single instance for large file uploads
      exec_mode: 'fork', // Fork mode for better memory management
      env: {
        NODE_ENV: 'production',
        NODE_OPTIONS: '--max-old-space-size=2048 --expose-gc', // 2GB heap + GC access
        UV_THREADPOOL_SIZE: 8 // Increase thread pool for file operations
      },
      max_memory_restart: '1800M', // Restart if memory exceeds 1.8GB
      node_args: '--max-old-space-size=2048 --expose-gc',
      kill_timeout: 30000, // 30 second graceful shutdown
      listen_timeout: 10000,
      max_restarts: 3,
      min_uptime: '10s',
      watch: false,
      ignore_watch: ['node_modules', 'uploads', 'covers', 'temp'],
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }]
  };
  
  const ecosystemPath = path.join(__dirname, '..', 'ecosystem.config.js');
  const configContent = `module.exports = ${JSON.stringify(ecosystemConfig, null, 2)};\n`;
  
  fs.writeFileSync(ecosystemPath, configContent);
  log('Created optimized PM2 ecosystem configuration');
  
  return true;
};

// 4. Create upload monitoring script
const createUploadMonitor = () => {
  log('Creating upload monitoring script...');
  
  const monitorScript = `#!/usr/bin/env node

/**
 * Upload Monitor - Real-time monitoring for large file uploads
 */

const fs = require('fs');
const path = require('path');

const UPLOAD_DIR = process.env.FILE_UPLOAD_PATH || './uploads';
const LOG_FILE = './logs/upload-monitor.log';

const log = (message) => {
  const timestamp = new Date().toISOString();
  const logMessage = \`[\${timestamp}] \${message}\\n\`;
  console.log(logMessage.trim());
  
  // Append to log file
  fs.appendFileSync(LOG_FILE, logMessage);
};

const monitorUploads = () => {
  if (!fs.existsSync(UPLOAD_DIR)) {
    log('Upload directory does not exist, creating...');
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
  
  log('Starting upload monitoring...');
  
  // Monitor upload directory for new files
  fs.watch(UPLOAD_DIR, (eventType, filename) => {
    if (filename) {
      const filePath = path.join(UPLOAD_DIR, filename);
      
      if (eventType === 'rename') {
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          log(\`New upload started: \${filename} (\${(stats.size / 1024 / 1024).toFixed(2)} MB)\`);
        } else {
          log(\`Upload completed or removed: \${filename}\`);
        }
      }
    }
  });
  
  // Monitor system resources every 30 seconds
  setInterval(() => {
    const memUsage = process.memoryUsage();
    const memUsedMB = (memUsage.heapUsed / 1024 / 1024).toFixed(2);
    const memTotalMB = (memUsage.heapTotal / 1024 / 1024).toFixed(2);
    
    log(\`Memory usage: \${memUsedMB}MB / \${memTotalMB}MB heap\`);
    
    // Force garbage collection if memory usage is high
    if (memUsage.heapUsed > 500 * 1024 * 1024 && global.gc) { // 500MB threshold
      global.gc();
      log('Forced garbage collection due to high memory usage');
    }
  }, 30000);
};

if (require.main === module) {
  monitorUploads();
}

module.exports = { monitorUploads };
`;
  
  const monitorPath = path.join(__dirname, 'upload-monitor.js');
  fs.writeFileSync(monitorPath, monitorScript);
  fs.chmodSync(monitorPath, '755');
  
  log('Created upload monitoring script');
  
  return true;
};

// Main execution
const main = async () => {
  try {
    // Create logs directory
    const logsDir = path.join(__dirname, '..', 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
      log('Created logs directory');
    }
    
    // Run optimizations
    const results = [
      updateAudioFilesController(),
      updateDRMUtility(),
      createOptimizedEcosystem(),
      createUploadMonitor()
    ];
    
    const successCount = results.filter(Boolean).length;
    
    if (successCount === results.length) {
      log('All optimizations completed successfully!');
      info('');
      info('Next steps:');
      info('1. Restart your Node.js application');
      info('2. Apply the Nginx configuration fix');
      info('3. Monitor uploads with: node scripts/upload-monitor.js');
      info('4. Use PM2 with: pm2 start ecosystem.config.js');
      info('');
      info('These optimizations should resolve the upstream connection issues.');
    } else {
      warning(`Completed ${successCount}/${results.length} optimizations`);
      warning('Some optimizations may have failed - check the logs above');
    }
    
  } catch (err) {
    error(`Optimization failed: ${err.message}`);
    process.exit(1);
  }
};

if (require.main === module) {
  main();
}

module.exports = {
  updateAudioFilesController,
  updateDRMUtility,
  createOptimizedEcosystem,
  createUploadMonitor
};