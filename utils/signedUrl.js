const crypto = require('crypto');

// Generate signature for signed URL parameters
const generateSignature = ({ fileRef, start, end, expires, ip }) => {
  const secret = process.env.SIGNED_URL_SECRET || 'default-secret-key';
  const data = `${fileRef}:${start}:${end}:${expires}:${ip}`;
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
};

// Verify signature for signed URL parameters
const verifySignature = ({ fileRef, start, end, expires, ip, sig }) => {
  const expectedSig = generateSignature({ fileRef, start, end, expires, ip });
  return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expectedSig, 'hex'));
};

// Generate signed URL for audio streaming with timestamp parameters
const generateSignedStreamUrl = (fileId, options = {}) => {
  const {
    start = '0',
    end = '-1',
    expiresIn = 30 * 60 * 1000, // 30 minutes default
    ip = '127.0.0.1',
    token = null
  } = options;
  
  const expires = Date.now() + expiresIn;
  const signature = generateSignature({
    fileRef: fileId.toString(),
    start: start.toString(),
    end: end.toString(),
    expires,
    ip
  });
  
  const baseUrl = process.env.API_BASE_URL || 'http://localhost:5000/api/v1';
  let url = `${baseUrl}/drm/audio/${fileId}/stream-signed?start=${start}&end=${end}&expires=${expires}&sig=${signature}`;
  
  // Add token parameter if provided
  if (token) {
    url += `&token=${encodeURIComponent(token)}`;
  }
  
  return url;
};

// Convert time in seconds to byte offset (approximate)
const timeToByteOffset = (timeInSeconds, duration, fileSize) => {
  if (!duration || duration <= 0) return 0;
  const ratio = timeInSeconds / duration;
  return Math.floor(ratio * fileSize);
};

// Set range headers for partial content responses
const setRangeHeaders = (res, { status, start, end, fileSize, contentType }) => {
  res.status(status);
  res.setHeader('Content-Type', contentType || 'audio/mpeg');
  res.setHeader('Accept-Ranges', 'bytes');
  
  if (status === 206) {
    res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    res.setHeader('Content-Length', end - start + 1);
  } else {
    res.setHeader('Content-Length', fileSize);
  }
  
  // Security headers
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'none'");
  res.setHeader('X-Download-Options', 'noopen');
  res.setHeader('Content-Disposition', 'inline; filename="protected-audio"');
};

// Generate signed URL for chapter streaming with enhanced security
const generateChapterStreamUrl = (fileId, chapterId, options = {}) => {
  const {
    expiresIn = 30 * 60 * 1000, // 30 minutes default
    ip = '127.0.0.1',
    token = null,
    start = '0',
    end = '-1'
  } = options;
  
  const expires = Date.now() + expiresIn;
  const chapterRef = `${fileId}:${chapterId}`;
  
  const signature = generateSignature({
    fileRef: chapterRef,
    start: start.toString(),
    end: end.toString(),
    expires,
    ip
  });
  
  const baseUrl = process.env.API_BASE_URL || 'http://localhost:5000/api/v1';
  let url = `${baseUrl}/files/${fileId}/chapters/${chapterId}/stream?start=${start}&end=${end}&expires=${expires}&sig=${signature}`;
  
  // Add token parameter if provided
  if (token) {
    url += `&token=${encodeURIComponent(token)}`;
  }
  
  return url;
};

module.exports = {
  generateSignature,
  verifySignature,
  generateSignedStreamUrl,
  generateChapterStreamUrl,
  timeToByteOffset,
  setRangeHeaders
};