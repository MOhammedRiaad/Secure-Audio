const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV for GCM
const TAG_LENGTH = 16; // 128-bit authentication tag
const CHUNK_SIZE = 64 * 1024; // 64KB chunks

class AudioDRM {
  constructor() {
    this.encryptionKey = process.env.STREAM_TOKEN_SECRET || process.env.JWT_SECRET;
    if (!this.encryptionKey) {
      throw new Error('DRM encryption key not configured');
    }
    
    // Ensure we have a 32-byte key for AES-256
    this.encryptionKeyBuffer = crypto.createHash('sha256').update(this.encryptionKey).digest();
    this.encryptionKeyHex = this.encryptionKeyBuffer.toString('hex');
    
    console.log('🔐 DRM initialized with key length:', this.encryptionKeyHex.length, 'chars');
  }

  // Generate a unique file encryption key
  generateFileKey() {
    return crypto.randomBytes(32);
  }

  // Encrypt audio file at rest
  async encryptAudioFile(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
      const fileKey = this.generateFileKey();
      const iv = crypto.randomBytes(IV_LENGTH);
      
      const cipher = crypto.createCipheriv(ALGORITHM, fileKey, iv);
      const input = fs.createReadStream(inputPath);
      const output = fs.createWriteStream(outputPath);
      
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
      
      input.pipe(cipher).pipe(output);
      
      output.on('finish', () => {
        resolve({ fileKey: fileKey.toString('hex'), iv: iv.toString('hex') });
      });
      
      output.on('error', reject);
      input.on('error', reject);
    });
  }

  // Decrypt and stream audio file in chunks
  createSecureStream(filePath, res, startByte = 0, endByte = null) {
    return new Promise((resolve, reject) => {
      const fileStream = fs.createReadStream(filePath);
      let headerRead = false;
      let fileKey = null;
      let iv = null;
      let dataStartPosition = 0;
      let buffer = Buffer.alloc(0);
      
      fileStream.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        
        if (!headerRead && buffer.length >= 5) {
          // Read magic bytes and version
          const magic = buffer.slice(0, 5).toString('utf8');
          if (magic !== 'SADRM') {
            return reject(new Error('Invalid DRM file format'));
          }
          
          const version = buffer[5];
          if (version !== 1) {
            return reject(new Error('Unsupported DRM version'));
          }
          
          let offset = 6;
          
          // Read IV
          const ivLength = buffer[offset];
          offset++;
          
          if (buffer.length < offset + ivLength) return; // Wait for more data
          
          iv = buffer.slice(offset, offset + ivLength);
          offset += ivLength;
          
          // Read encrypted file key
          const keyLength = buffer[offset];
          offset++;
          
          if (buffer.length < offset + keyLength) return; // Wait for more data
          
          const encryptedFileKey = buffer.slice(offset, offset + keyLength).toString('hex');
          offset += keyLength;
          
          // Decrypt file key
          try {
            const decryptedKey = this.decryptData(encryptedFileKey);
            fileKey = Buffer.from(decryptedKey, 'hex');
          } catch (error) {
            return reject(new Error('Failed to decrypt file key'));
          }
          
          dataStartPosition = offset;
          headerRead = true;
          
          // Process remaining data
          if (buffer.length > offset) {
            const encryptedData = buffer.slice(offset);
            this.streamDecryptedChunk(encryptedData, fileKey, iv, res);
          }
        } else if (headerRead) {
          // Stream encrypted data chunks
          this.streamDecryptedChunk(chunk, fileKey, iv, res);
        }
      });
      
      fileStream.on('end', () => {
        res.end();
        resolve();
      });
      
      fileStream.on('error', reject);
    });
  }

  // Stream decrypted chunks with anti-download measures
  streamDecryptedChunk(encryptedChunk, fileKey, iv, res) {
    try {
      // Create decipher for this chunk
      const decipher = crypto.createDecipheriv(ALGORITHM, fileKey, iv);
      
      // Decrypt chunk
      let decrypted = decipher.update(encryptedChunk);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      
      // Send decrypted chunk directly (obfuscation was preventing playback)
      res.write(decrypted);
      
    } catch (error) {
      console.error('Chunk decryption error:', error);
    }
  }

  // Obfuscate audio data to prevent direct extraction
  obfuscateAudioData(audioData) {
    // Apply reversible transformation that makes raw data unusable
    const obfuscated = Buffer.alloc(audioData.length);
    const key = crypto.createHash('sha256').update(this.encryptionKey).digest();
    
    for (let i = 0; i < audioData.length; i++) {
      obfuscated[i] = audioData[i] ^ key[i % key.length];
    }
    
    return obfuscated;
  }

  // Helper method to encrypt data
  encryptData(data, key = null) {
    const keyToUse = key || this.encryptionKeyHex;
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(keyToUse, 'hex'), iv);
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  // Helper method to decrypt data
  decryptData(encryptedData, key = null) {
    try {
      const keyToUse = key || this.encryptionKeyHex;
      const parts = encryptedData.split(':');
      
      if (parts.length !== 3) {
        throw new Error('Invalid encrypted data format');
      }
      
      const [ivString, authTagString, encrypted] = parts;
      const iv = Buffer.from(ivString, 'hex');
      const authTag = Buffer.from(authTagString, 'hex');
      
      const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(keyToUse, 'hex'), iv);
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('🚨 DRM decryption error:', error.message);
      throw new Error('Failed to decrypt DRM data');
    }
  }

  // Generate secure streaming session
  generateSecureSession(fileId, userId) {
    const sessionData = {
      fileId,
      userId,
      timestamp: Date.now(),
      sessionId: crypto.randomUUID(),
      expiry: Date.now() + (30 * 60 * 1000) // 30 minutes
    };
    
    console.log('🔐 Generating DRM session:', {
      fileId,
      userId,
      sessionId: sessionData.sessionId,
      expiry: new Date(sessionData.expiry).toISOString()
    });
    
    return this.encryptData(JSON.stringify(sessionData));
  }

  // Validate secure session
  validateSecureSession(sessionToken) {
    try {
      console.log('🔍 Validating DRM session token:', sessionToken ? `${sessionToken.substring(0, 30)}...` : 'none');
      
      const decrypted = this.decryptData(sessionToken);
      const sessionData = JSON.parse(decrypted);
      
      console.log('✅ DRM session decrypted successfully:', {
        fileId: sessionData.fileId,
        userId: sessionData.userId,
        sessionId: sessionData.sessionId,
        expiry: new Date(sessionData.expiry).toISOString(),
        isExpired: Date.now() > sessionData.expiry
      });
      
      if (Date.now() > sessionData.expiry) {
        console.warn('⏰ DRM session expired:', {
          now: new Date().toISOString(),
          expiry: new Date(sessionData.expiry).toISOString(),
          expiredBy: (Date.now() - sessionData.expiry) / 1000 + ' seconds'
        });
        throw new Error('Session expired');
      }
      
      return sessionData;
    } catch (error) {
      console.error('❌ DRM session validation failed:', {
        error: error.message,
        sessionToken: sessionToken ? `${sessionToken.substring(0, 30)}...` : 'none'
      });
      
      if (error.message.includes('Session expired')) {
        throw new Error('Session expired');
      }
      
      throw new Error('Invalid session token');
    }
  }

  // Encrypt individual chunks for secure streaming
  encryptChunk(buffer, sessionToken, chunkNumber) {
    try {
      // Create chunk-specific key by combining session token and chunk number
      const chunkKey = crypto.createHash('sha256')
        .update(sessionToken + chunkNumber.toString())
        .digest();
      
      // Generate random IV for this chunk
      const iv = crypto.randomBytes(16);
      
      // Encrypt the chunk
      const cipher = crypto.createCipheriv('aes-256-cbc', chunkKey, iv);
      cipher.setAutoPadding(true);
      
      let encrypted = cipher.update(buffer);
      encrypted = Buffer.concat([encrypted, cipher.final()]);
      
      // Prepend IV to encrypted data
      const result = Buffer.concat([iv, encrypted]);
      
      // Add obfuscation layer
      return this.obfuscateAudioData(result);
      
    } catch (error) {
      console.error('Chunk encryption error:', error);
      throw new Error('Failed to encrypt chunk');
    }
  }

  // Decrypt individual chunks (for client-side decryption)
  decryptChunk(encryptedBuffer, sessionToken, chunkNumber) {
    try {
      // Remove obfuscation
      const deobfuscated = this.obfuscateAudioData(encryptedBuffer);
      
      // Extract IV and encrypted data
      const iv = deobfuscated.slice(0, 16);
      const encrypted = deobfuscated.slice(16);
      
      // Recreate chunk-specific key
      const chunkKey = crypto.createHash('sha256')
        .update(sessionToken + chunkNumber.toString())
        .digest();
      
      // Decrypt the chunk
      const decipher = crypto.createDecipheriv('aes-256-cbc', chunkKey, iv);
      decipher.setAutoPadding(true);
      
      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      
      return decrypted;
      
    } catch (error) {
      console.error('Chunk decryption error:', error);
      throw new Error('Failed to decrypt chunk');
    }
  }

  // Encrypt audio file at rest with AES-256-GCM
  async encryptAudioFile(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
      try {
        // Generate unique encryption key and IV for this file
        const key = crypto.randomBytes(32).toString('hex');
        const iv = crypto.randomBytes(IV_LENGTH).toString('hex');
        
        // Create cipher for streaming encryption
        const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(key, 'hex'), Buffer.from(iv, 'hex'));
        
        // Create read and write streams
        const readStream = fs.createReadStream(inputPath, { highWaterMark: CHUNK_SIZE });
        const writeStream = fs.createWriteStream(outputPath);
        
        // Write IV first (will be needed for decryption)
        writeStream.write(Buffer.from(iv, 'hex'));
        
        let encryptedChunks = [];
        
        // Handle streaming encryption
        readStream.on('data', (chunk) => {
          const encryptedChunk = cipher.update(chunk);
          encryptedChunks.push(encryptedChunk);
          writeStream.write(encryptedChunk);
        });
        
        readStream.on('end', () => {
          try {
            // Finalize encryption and get auth tag
            const finalChunk = cipher.final();
            const authTag = cipher.getAuthTag();
            
            // Write final chunk and auth tag
            writeStream.write(finalChunk);
            writeStream.write(authTag);
            
            writeStream.end();
            
            writeStream.on('finish', () => {
              resolve({
                key,
                iv,
                authTag: authTag.toString('hex'),
                encryptedPath: outputPath
              });
            });
            
          } catch (error) {
            writeStream.destroy();
            reject(new Error('Failed to finalize encryption: ' + error.message));
          }
        });
        
        readStream.on('error', (error) => {
          writeStream.destroy();
          reject(new Error('Failed to read input file: ' + error.message));
        });
        
        writeStream.on('error', (error) => {
          readStream.destroy();
          reject(new Error('Failed to write encrypted file: ' + error.message));
        });
        
      } catch (error) {
        console.error('File encryption error:', error);
        reject(new Error('Failed to encrypt audio file: ' + error.message));
      }
    });
  }

  // Create decrypted stream for encrypted files (GCM format) - ENHANCED WITH DEBUG
  createDecryptedStream(encryptedFilePath, options) {
    try {
      const { key } = options;
      
      if (!key) {
        throw new Error('DRM decryption key is required');
      }
      
      // Get file size
      const stats = fs.statSync(encryptedFilePath);
      const fileSize = stats.size;
      
      console.log(`🔐 Creating decrypted stream for file: ${(fileSize / 1024 / 1024).toFixed(2)}MB`);
      console.log(`🔐 File path: ${encryptedFilePath}`);
      console.log(`🔐 Key provided: ${key ? 'YES' : 'NO'}`);
      
      // Validate file size meets minimum DRM format requirements
      if (fileSize < IV_LENGTH + TAG_LENGTH) {
        throw new Error(`File too small for DRM format. Expected at least ${IV_LENGTH + TAG_LENGTH} bytes, got ${fileSize} bytes`);
      }
      
      // Read auth tag from the end of the file
      const authTagBuffer = Buffer.alloc(TAG_LENGTH);
      const fd = fs.openSync(encryptedFilePath, 'r');
      fs.readSync(fd, authTagBuffer, 0, TAG_LENGTH, fileSize - TAG_LENGTH);
      fs.closeSync(fd);
      
      console.log(`🔐 Auth tag read: ${authTagBuffer.toString('hex')} (${authTagBuffer.length} bytes)`);
      
      // Read first few bytes to check file format
      const headerBuffer = Buffer.alloc(32);
      const headerFd = fs.openSync(encryptedFilePath, 'r');
      const headerBytesRead = fs.readSync(headerFd, headerBuffer, 0, 32, 0);
      fs.closeSync(headerFd);
      
      console.log(`🔐 File header (first ${headerBytesRead} bytes): ${headerBuffer.slice(0, headerBytesRead).toString('hex')}`);
      
      // Check if this looks like our expected format
      const potentialIV = headerBuffer.slice(0, IV_LENGTH);
      console.log(`🔐 Potential IV: ${potentialIV.toString('hex')}`);
      
      // Create a transform stream for decryption
      const { Transform } = require('stream');
      
      const decryptTransform = new Transform({
        highWaterMark: 64 * 1024, // 64KB chunks
        
        transform(chunk, encoding, callback) {
          try {
            // For the first chunk, extract the IV
            if (!this.headerExtracted) {
              console.log(`🔐 Processing first chunk: ${chunk.length} bytes`);
              console.log(`🔐 First chunk hex: ${chunk.slice(0, Math.min(32, chunk.length)).toString('hex')}`);
              
              if (chunk.length < IV_LENGTH) {
                // Buffer incomplete header
                this.headerBuffer = this.headerBuffer ? Buffer.concat([this.headerBuffer, chunk]) : chunk;
                if (this.headerBuffer.length < IV_LENGTH) {
                  console.log(`🔐 Waiting for more header data: ${this.headerBuffer.length}/${IV_LENGTH}`);
                  return callback(); // Wait for more data
                }
                chunk = this.headerBuffer;
                this.headerBuffer = null;
              }
              
              this.fileIV = chunk.slice(0, IV_LENGTH);
              chunk = chunk.slice(IV_LENGTH);
              this.headerExtracted = true;
              this.totalProcessed = IV_LENGTH;
              
              console.log(`🔐 IV extracted: ${this.fileIV.toString('hex')} (${this.fileIV.length} bytes)`);
              console.log(`🔐 Remaining chunk after IV: ${chunk.length} bytes`);
              
              // Initialize decipher with the IV from the file
              try {
                this.decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(key, 'hex'), this.fileIV);
                this.decipher.setAuthTag(authTagBuffer);
                console.log(`🔐 Decipher initialized successfully`);
              } catch (decipherError) {
                console.error(`🚨 Failed to initialize decipher: ${decipherError.message}`);
                return callback(decipherError);
              }
              
              console.log(`🔐 Header extracted, remaining chunk size: ${chunk.length} bytes`);
            } else {
              console.log(`🔐 Processing subsequent chunk: ${chunk.length} bytes`);
            }
            
            // Track how much we've processed to avoid decrypting the auth tag
            this.totalProcessed = (this.totalProcessed || 0) + chunk.length;
            
            // Don't decrypt the last TAG_LENGTH bytes (auth tag)
            if (this.totalProcessed > fileSize - TAG_LENGTH) {
              const overrun = this.totalProcessed - (fileSize - TAG_LENGTH);
              const originalChunkLength = chunk.length;
              chunk = chunk.slice(0, chunk.length - overrun);
              console.log(`🔐 Trimmed chunk to avoid auth tag: ${originalChunkLength} -> ${chunk.length} bytes`);
            }
            
            // Decrypt the chunk
            if (chunk.length > 0) {
              try {
                const decrypted = this.decipher.update(chunk);
                console.log(`🔐 Decrypted chunk: ${chunk.length} -> ${decrypted.length} bytes`);
                
                // Log first few bytes of decrypted data for analysis
                if (decrypted.length > 0 && this.totalProcessed <= IV_LENGTH + 64) {
                  console.log(`🔐 Decrypted data sample: ${decrypted.slice(0, Math.min(32, decrypted.length)).toString('hex')}`);
                }
                
                callback(null, decrypted);
              } catch (decryptError) {
                console.error(`🚨 Chunk decryption error: ${decryptError.message}`);
                callback(decryptError);
              }
            } else {
              console.log(`🔐 Skipping empty chunk`);
              callback();
            }
            
          } catch (error) {
            console.error('🚨 Decryption transform error:', error);
            callback(error);
          }
        },
        
        flush(callback) {
          try {
            if (this.decipher) {
              const final = this.decipher.final();
              console.log(`🔐 Decryption completed, final chunk size: ${final.length} bytes`);
              callback(null, final);
            } else {
              callback();
            }
          } catch (error) {
            console.error('🚨 Decryption flush error:', error);
            callback(error);
          }
        }
      });
      
      // Create file read stream
      const fileStream = fs.createReadStream(encryptedFilePath, { highWaterMark: 64 * 1024 });
      
      // Add error handling
      fileStream.on('error', (error) => {
        console.error('🚨 File read stream error:', error);
      });
      
      decryptTransform.on('error', (error) => {
        console.error('🚨 Decrypt transform error:', error);
      });
      
      return fileStream.pipe(decryptTransform);
      
    } catch (error) {
      console.error('🚨 Decrypted stream creation error:', error);
      throw new Error('Failed to create decrypted stream');
    }
  }

  // Create decrypted stream with FFmpeg-based seeking for encrypted files
  async createDecryptedStreamWithSeek(encryptedFilePath, options) {
    try {
      const { key, startTime = 0 } = options;
      const { spawn } = require('child_process');
      
      if (startTime === 0) {
        // No seeking needed, use existing method
        return this.createDecryptedStream(encryptedFilePath, options);
      }
      
      console.log(`🔐 Creating FFmpeg-based seek stream for encrypted file at ${startTime}s`);
      
      // Get the absolute path to FFmpeg executable
      const ffmpegPath = path.join(__dirname, '..', 'ffmpeg-8.0-essentials_build', 'bin', 'ffmpeg.exe');
      
      // Use FFmpeg to decrypt and seek in one operation
      const ffmpeg = spawn(ffmpegPath, [
        '-f', 'mp3',           // Input format
        '-i', 'pipe:0',        // Read decrypted data from stdin
        '-ss', startTime.toString(), // Seek to start time
        '-c', 'copy',          // Copy without re-encoding when possible
        '-f', 'mp3',           // Output format
        '-avoid_negative_ts', 'make_zero', // Handle timestamp issues
        'pipe:1'               // Output to stdout
      ], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      // Handle FFmpeg errors
      ffmpeg.stderr.on('data', (data) => {
        console.log('FFmpeg stderr:', data.toString());
      });
      
      ffmpeg.on('error', (error) => {
        console.error('FFmpeg process error:', error);
      });
      
      // Create decryption stream and pipe to ffmpeg
      const decryptStream = this.createDecryptedStream(encryptedFilePath, options);
      decryptStream.pipe(ffmpeg.stdin);
      
      // Handle decryption stream errors
      decryptStream.on('error', (error) => {
        console.error('Decryption stream error:', error);
        ffmpeg.kill();
      });
      
      return ffmpeg.stdout;
      
    } catch (error) {
      console.error('FFmpeg decrypted stream creation error:', error);
      throw new Error('Failed to create FFmpeg decrypted stream with seek');
    }
  }

  // Encrypt individual chapter segment with AES-256-GCM - OLD WORKING VERSION
  encryptChapterSegment(audioBuffer) {
    try {
      const key = crypto.randomBytes(32);
      const iv = crypto.randomBytes(IV_LENGTH);
      
      const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
      
      let encrypted = cipher.update(audioBuffer);
      const finalChunk = cipher.final();
      const authTag = cipher.getAuthTag();
      
      encrypted = Buffer.concat([encrypted, finalChunk]);
      
      return {
        key: key.toString('hex'),
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
        encryptedData: encrypted,
        plainSize: audioBuffer.length,
        encryptedSize: encrypted.length
      };
      
    } catch (error) {
      console.error('Chapter encryption error:', error);
      throw new Error('Failed to encrypt chapter segment');
    }
  }

  // Decrypt individual chapter segment - OLD WORKING VERSION
  decryptChapterSegment(encryptedData, key, iv, authTag) {
    try {
      const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(key, 'hex'), Buffer.from(iv, 'hex'));
      decipher.setAuthTag(Buffer.from(authTag, 'hex'));
      
      let decrypted = decipher.update(encryptedData);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      
      return decrypted;
      
    } catch (error) {
      console.error('Chapter decryption error:', error);
      throw new Error('Failed to decrypt chapter segment');
    }
  }

  // Extract audio segment from master file using FFmpeg - OLD WORKING VERSION
  async extractAudioSegment(masterFilePath, startTime, endTime, masterKey) {
    return new Promise((resolve, reject) => {
      const { spawn } = require('child_process');
      const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
      
      // Create a temporary decrypted stream of the master file
      const decryptedStream = this.createDecryptedStream(masterFilePath, { key: masterKey });
      
      // Calculate duration
      const duration = endTime ? endTime - startTime : null;
      
      // FFmpeg arguments for extraction
      const args = [
        '-f', 'mp3',
        '-i', 'pipe:0',  // Read from stdin
        '-ss', startTime.toString(),
        ...(duration ? ['-t', duration.toString()] : []),
        '-c', 'copy',  // Copy without re-encoding when possible
        '-f', 'mp3',
        'pipe:1'  // Output to stdout
      ];
      
      const ffmpeg = spawn(ffmpegPath, args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      const chunks = [];
      let errorOutput = '';
      
      // Pipe decrypted master file to FFmpeg
      decryptedStream.pipe(ffmpeg.stdin);
      
      // Collect output chunks
      ffmpeg.stdout.on('data', (chunk) => {
        chunks.push(chunk);
      });
      
      ffmpeg.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      ffmpeg.on('close', (code) => {
        if (code === 0) {
          const segmentBuffer = Buffer.concat(chunks);
          resolve(segmentBuffer);
        } else {
          console.error('FFmpeg error:', errorOutput);
          reject(new Error(`FFmpeg exited with code ${code}`));
        }
      });
      
      ffmpeg.on('error', (error) => {
        console.error('FFmpeg spawn error:', error);
        reject(error);
      });
      
      decryptedStream.on('error', (error) => {
        console.error('Decryption stream error:', error);
        ffmpeg.kill();
        reject(error);
      });
    });
  }

  // NEW: File-based chapter processing to avoid piping issues (ENHANCED)
  async processChapterStream(masterFilePath, startTime, endTime, masterKey, outputPath) {
    console.log('🚀 NEW FILE-BASED CHAPTER PROCESSING CALLED!', {
      masterFilePath,
      startTime,
      endTime,
      outputPath,
      timestamp: new Date().toISOString()
    });
    
    return new Promise(async (resolve, reject) => {
      const { spawn } = require('child_process');
      let ffmpegPath;
      const fs = require('fs');
      
      // Use system FFmpeg as fallback if package version fails
      try {
        ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
        console.log('🔧 Using package FFmpeg:', ffmpegPath);
      } catch (error) {
        ffmpegPath = 'ffmpeg';
        console.log('🔧 Package FFmpeg not found, using system FFmpeg');
      }
      
      console.log(`🔧 Processing chapter: ${startTime}s to ${endTime || 'end'}s`);
      
      // STEP 1: Create temporary decrypted file first
      const tempDecryptedPath = path.join(
        process.env.FILE_UPLOAD_PATH, 
        'temp', 
        `temp_decrypted_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.mp3`
      );
      
      // Ensure temp directory exists
      const tempDir = path.dirname(tempDecryptedPath);
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      console.log(`🔐 Step 1: Creating temporary decrypted file...`);
      
      try {
        // Create full decrypted file first (this is proven to work)
        await this.createTemporaryDecryptedFile(masterFilePath, masterKey, tempDecryptedPath);
        
        console.log(`✅ Temporary decrypted file created: ${tempDecryptedPath}`);
        
        // STEP 2: Use FFmpeg with direct file access (proven to work)
        console.log(`🔧 Step 2: Extracting chapter segment with FFmpeg...`);
        
        const duration = endTime ? endTime - startTime : null;
        
        // Enhanced FFmpeg arguments for file-based processing
        const args = [
          '-y',              // Overwrite output file
          '-loglevel', 'error',  // Less verbose logging
          '-i', tempDecryptedPath,  // Input from temporary file
          '-ss', startTime.toString(),
          ...(duration ? ['-t', duration.toString()] : []),
          '-avoid_negative_ts', 'make_zero',
          '-c:a', 'copy',    // Copy audio codec (no re-encoding)
          '-f', 'mp3',       // Force output format
          outputPath         // Output to final location
        ];
        
        console.log(`🔧 FFmpeg command: ${ffmpegPath} ${args.join(' ')}`);
        
        const ffmpeg = spawn(ffmpegPath, args, {
          stdio: ['pipe', 'pipe', 'pipe']
        });
        
        let errorOutput = '';
        
        ffmpeg.stderr.on('data', (data) => {
          const errorText = data.toString();
          errorOutput += errorText;
          if (errorText.includes('Error') || errorText.includes('Invalid')) {
            console.log('🔧 FFmpeg stderr:', errorText.trim());
          }
        });
        
        ffmpeg.on('close', (code) => {
          // Clean up temporary file immediately
          try {
            if (fs.existsSync(tempDecryptedPath)) {
              fs.unlinkSync(tempDecryptedPath);
              console.log('🧹 Cleaned up temporary decrypted file');
            }
          } catch (cleanupError) {
            console.warn(`⚠️ Cleanup warning: ${cleanupError.message}`);
          }
          
          if (code === 0) {
            // Verify output file was created and has content
            if (fs.existsSync(outputPath)) {
              const stats = fs.statSync(outputPath);
              if (stats.size > 0) {
                console.log(`✅ Chapter extracted successfully: ${stats.size} bytes`);
                resolve({
                  success: true,
                  filePath: outputPath,
                  size: stats.size
                });
              } else {
                console.error('❌ Output file is empty');
                reject(new Error('FFmpeg produced empty output file'));
              }
            } else {
              console.error('❌ Output file not created');
              reject(new Error('FFmpeg did not create output file'));
            }
          } else {
            console.error(`❌ FFmpeg error (exit code ${code}):`, errorOutput);
            reject(new Error(`FFmpeg exited with code ${code}: ${errorOutput}`));
          }
        });
        
        ffmpeg.on('error', (error) => {
          // Clean up on error
          try {
            if (fs.existsSync(tempDecryptedPath)) {
              fs.unlinkSync(tempDecryptedPath);
            }
          } catch (cleanupError) {}
          
          console.error('❌ FFmpeg spawn error:', error);
          reject(new Error(`Failed to spawn FFmpeg: ${error.message}`));
        });
        
        // Add timeout for FFmpeg process
        const timeout = setTimeout(() => {
          console.error('❌ FFmpeg process timeout');
          ffmpeg.kill('SIGKILL');
          
          // Clean up on timeout
          try {
            if (fs.existsSync(tempDecryptedPath)) {
              fs.unlinkSync(tempDecryptedPath);
            }
          } catch (cleanupError) {}
          
          reject(new Error('FFmpeg process timed out after 120 seconds'));
        }, 120000); // 2 minute timeout
        
        ffmpeg.on('close', () => {
          clearTimeout(timeout);
        });
        
      } catch (decryptionError) {
        // Clean up on decryption error
        try {
          if (fs.existsSync(tempDecryptedPath)) {
            fs.unlinkSync(tempDecryptedPath);
          }
        } catch (cleanupError) {}
        
        console.error('❌ Temporary file creation error:', decryptionError);
        reject(new Error(`Failed to create temporary decrypted file: ${decryptionError.message}`));
      }
    });
  }

  // Helper method to create temporary decrypted file
  async createTemporaryDecryptedFile(encryptedFilePath, encryptionKey, outputPath) {
    return new Promise((resolve, reject) => {
      try {
        console.log(`🔐 Creating temporary decrypted file from: ${encryptedFilePath}`);
        
        const decryptedStream = this.createDecryptedStream(encryptedFilePath, { 
          key: encryptionKey 
        });
        
        const writeStream = fs.createWriteStream(outputPath);
        
        let totalBytes = 0;
        let chunkCount = 0;
        
        decryptedStream.on('data', (chunk) => {
          chunkCount++;
          totalBytes += chunk.length;
          writeStream.write(chunk);
          
          // Log progress for large files
          if (chunkCount % 1000 === 0) {
            console.log(`🔐 Progress: ${chunkCount} chunks, ${(totalBytes / 1024 / 1024).toFixed(1)}MB`);
          }
        });
        
        decryptedStream.on('end', () => {
          writeStream.end();
          console.log(`✅ Decryption completed: ${chunkCount} chunks, ${(totalBytes / 1024 / 1024).toFixed(2)}MB`);
        });
        
        writeStream.on('finish', () => {
          const stats = fs.statSync(outputPath);
          console.log(`📁 Temporary file written: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
          resolve();
        });
        
        decryptedStream.on('error', (error) => {
          console.error(`❌ Decryption stream error: ${error.message}`);
          writeStream.destroy();
          
          // Clean up on error
          try {
            if (fs.existsSync(outputPath)) {
              fs.unlinkSync(outputPath);
            }
          } catch (cleanupError) {}
          
          reject(error);
        });
        
        writeStream.on('error', (error) => {
          console.error(`❌ Write stream error: ${error.message}`);
          decryptedStream.destroy();
          
          // Clean up on error
          try {
            if (fs.existsSync(outputPath)) {
              fs.unlinkSync(outputPath);
            }
          } catch (cleanupError) {}
          
          reject(error);
        });
        
      } catch (error) {
        console.error(`❌ Temporary file creation setup error: ${error.message}`);
        reject(error);
      }
    });
  }

  // NEW: Streaming chapter encryption from file (KEEPING THIS)
  async encryptChapterSegmentFromFile(inputFilePath) {
    return new Promise((resolve, reject) => {
      try {
        const key = crypto.randomBytes(32);
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
        
        const inputStream = fs.createReadStream(inputFilePath, { highWaterMark: 64 * 1024 }); // 64KB chunks
        const outputPath = inputFilePath + '.enc';
        const outputStream = fs.createWriteStream(outputPath);
        
        let plainSize = 0;
        let encryptedSize = 0;
        
        inputStream.on('data', (chunk) => {
          plainSize += chunk.length;
          const encryptedChunk = cipher.update(chunk);
          outputStream.write(encryptedChunk);
          encryptedSize += encryptedChunk.length;
        });
        
        inputStream.on('end', () => {
          try {
            const finalChunk = cipher.final();
            const authTag = cipher.getAuthTag();
            
            if (finalChunk.length > 0) {
              outputStream.write(finalChunk);
              encryptedSize += finalChunk.length;
            }
            
            outputStream.end();
            
            outputStream.on('finish', () => {
              // Clean up input file
              fs.unlinkSync(inputFilePath);
              
              resolve({
                key: key.toString('hex'),
                iv: iv.toString('hex'),
                authTag: authTag.toString('hex'),
                encryptedPath: outputPath,
                plainSize: plainSize,
                encryptedSize: encryptedSize
              });
            });
            
          } catch (error) {
            outputStream.destroy();
            reject(error);
          }
        });
        
        inputStream.on('error', (error) => {
          outputStream.destroy();
          reject(error);
        });
        
        outputStream.on('error', (error) => {
          inputStream.destroy();
          reject(error);
        });
        
      } catch (error) {
        reject(new Error('Failed to encrypt chapter segment from file'));
      }
    });
  }
}

module.exports = AudioDRM;