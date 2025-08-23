const crypto = require('crypto');
const { promisify } = require('util');
const randomBytes = promisify(crypto.randomBytes);

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16; // For AES, this is always 16
const TOKEN_EXPIRY = 60 * 5; // 5 minutes

// Generate a secure random key
const generateKey = async () => {
  return (await randomBytes(32)).toString('hex'); // 32 bytes = 256 bits
};

// Encrypt data
const encrypt = (text, key) => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(key, 'hex'), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
};

// Decrypt data
const decrypt = (text, key) => {
  const [ivString, encryptedText] = text.split(':');
  const iv = Buffer.from(ivString, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(key, 'hex'), iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};

// Generate a secure token for file access
const generateStreamToken = async (fileId, userId) => {
  const key = process.env.STREAM_TOKEN_SECRET || await generateKey();
  const expiry = Date.now() + (TOKEN_EXPIRY * 1000);
  const payload = JSON.stringify({ fileId, userId, expiry });
  return encrypt(payload, key);
};

// Validate and parse token
const validateStreamToken = async (token) => {
  try {
    const key = process.env.STREAM_TOKEN_SECRET;
    if (!key) throw new Error('Stream token secret not configured');
    
    const decrypted = decrypt(token, key);
    const { fileId, userId, expiry } = JSON.parse(decrypted);
    
    if (Date.now() > expiry) {
      throw new Error('Token expired');
    }
    
    return { fileId, userId, valid: true };
  } catch (error) {
    console.error('Token validation failed:', error);
    return { valid: false, error: 'Invalid or expired token' };
  }
};

module.exports = {
  generateStreamToken,
  validateStreamToken,
  generateKey
};
