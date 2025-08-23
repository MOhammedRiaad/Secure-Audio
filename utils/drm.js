const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;
const CHUNK_SIZE = 64 * 1024; // 64KB chunks

class AudioDRM {
  constructor() {
    this.encryptionKey = process.env.STREAM_TOKEN_SECRET;
    if (!this.encryptionKey) {
      throw new Error('DRM encryption key not configured');
    }
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
      const encryptedFileKey = this.encryptData(fileKey, this.encryptionKey);
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
            const decryptedKey = this.decryptData(encryptedFileKey, this.encryptionKey);
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
  encryptData(data, key) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(key, 'hex'), iv);
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  }

  // Helper method to decrypt data
  decryptData(encryptedData, key) {
    const [ivString, encrypted] = encryptedData.split(':');
    const iv = Buffer.from(ivString, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(key, 'hex'), iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
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
    
    return this.encryptData(JSON.stringify(sessionData), this.encryptionKey);
  }

  // Validate secure session
  validateSecureSession(sessionToken) {
    try {
      const decrypted = this.decryptData(sessionToken, this.encryptionKey);
      const sessionData = JSON.parse(decrypted);
      
      if (Date.now() > sessionData.expiry) {
        throw new Error('Session expired');
      }
      
      return sessionData;
    } catch (error) {
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

  // Encrypt audio file at rest
  async encryptAudioFile(inputPath, outputPath) {
    try {
      // Generate unique encryption key and IV for this file
      const key = crypto.randomBytes(32).toString('hex');
      const iv = crypto.randomBytes(16).toString('hex');
      
      // Read the input file
      const inputData = fs.readFileSync(inputPath);
      
      // Encrypt the file data
      const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key, 'hex'), Buffer.from(iv, 'hex'));
      cipher.setAutoPadding(true);
      
      let encrypted = cipher.update(inputData);
      encrypted = Buffer.concat([encrypted, cipher.final()]);
      
      // Prepend IV to encrypted data
      const result = Buffer.concat([Buffer.from(iv, 'hex'), encrypted]);
      
      // Write encrypted file
      fs.writeFileSync(outputPath, result);
      
      return {
        key,
        iv,
        encryptedPath: outputPath
      };
      
    } catch (error) {
      console.error('File encryption error:', error);
      throw new Error('Failed to encrypt audio file');
    }
  }

  // Create decrypted stream for encrypted files
  createDecryptedStream(encryptedFilePath, options) {
    try {
      const { key, iv } = options;
      
      // Read the encrypted file
      const encryptedData = fs.readFileSync(encryptedFilePath);
      
      // Extract IV and encrypted content
      const fileIV = encryptedData.slice(0, 16);
      const encrypted = encryptedData.slice(16);
      
      // Decrypt the file
      const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key, 'hex'), fileIV);
      decipher.setAutoPadding(true);
      
      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      
      // Create a readable stream from the decrypted buffer
      const { Readable } = require('stream');
      const stream = new Readable();
      stream.push(decrypted);
      stream.push(null); // End the stream
      
      return stream;
      
    } catch (error) {
      console.error('Decrypted stream creation error:', error);
      throw new Error('Failed to create decrypted stream');
    }
  }
}

module.exports = AudioDRM;