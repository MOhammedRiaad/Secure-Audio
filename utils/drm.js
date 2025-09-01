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

  // Create decrypted stream for encrypted files (GCM format) - OLD WORKING VERSION
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
      
      // Create a transform stream for decryption
      const { Transform } = require('stream');
      
      const decryptTransform = new Transform({
        highWaterMark: 64 * 1024, // 64KB chunks
        
        transform(chunk, encoding, callback) {
          try {
            // For the first chunk, extract the IV
            if (!this.headerExtracted) {
              if (chunk.length < IV_LENGTH) {
                // Buffer incomplete header
                this.headerBuffer = this.headerBuffer ? Buffer.concat([this.headerBuffer, chunk]) : chunk;
                if (this.headerBuffer.length < IV_LENGTH) {
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
              
              // Initialize decipher with the IV from the file
              this.decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(key, 'hex'), this.fileIV);
              this.decipher.setAuthTag(authTagBuffer);
              
              console.log(`🔐 Header extracted, remaining chunk size: ${chunk.length} bytes`);
            }
            
            // Track how much we've processed to avoid decrypting the auth tag
            this.totalProcessed = (this.totalProcessed || 0) + chunk.length;
            
            // Don't decrypt the last TAG_LENGTH bytes (auth tag)
            if (this.totalProcessed > fileSize - TAG_LENGTH) {
              const overrun = this.totalProcessed - (fileSize - TAG_LENGTH);
              chunk = chunk.slice(0, chunk.length - overrun);
            }
            
            // Decrypt the chunk
            if (chunk.length > 0) {
              const decrypted = this.decipher.update(chunk);
              callback(null, decrypted);
            } else {
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

  // NEW: Streaming chapter processing to avoid memory issues (KEEPING THIS)
  async processChapterStream(masterFilePath, startTime, endTime, masterKey, outputPath) {
    return new Promise((resolve, reject) => {
      const { spawn } = require('child_process');
      const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
      const fs = require('fs');
      
      // Create a temporary decrypted stream of the master file
      const decryptedStream = this.createDecryptedStream(masterFilePath, { key: masterKey });
      
      // Calculate duration
      const duration = endTime ? endTime - startTime : null;
      
      // FFmpeg arguments for extraction with output to file
      const args = [
        '-f', 'mp3',
        '-i', 'pipe:0',  // Read from stdin
        '-ss', startTime.toString(),
        ...(duration ? ['-t', duration.toString()] : []),
        '-c', 'copy',  // Copy without re-encoding when possible
        '-f', 'mp3',
        outputPath  // Output to file instead of memory
      ];
      
      const ffmpeg = spawn(ffmpegPath, args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let errorOutput = '';
      
      // Pipe decrypted master file to FFmpeg
      decryptedStream.pipe(ffmpeg.stdin);
      
      ffmpeg.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      ffmpeg.on('close', (code) => {
        if (code === 0) {
          // Read file stats for size information
          const stats = fs.statSync(outputPath);
          resolve({
            success: true,
            filePath: outputPath,
            size: stats.size
          });
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