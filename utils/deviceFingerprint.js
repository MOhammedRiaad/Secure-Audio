const crypto = require('crypto');
const UAParser = require('ua-parser-js');

/**
 * Device Fingerprinting Utility
 * Generates unique device identifiers and fingerprints for security purposes
 */
class DeviceFingerprint {
  /**
   * Generate a unique device ID based on user agent and IP
   * @param {string} userAgent - Browser user agent string
   * @param {string} ipAddress - Client IP address
   * @param {Object} additionalData - Additional device data (optional)
   * @returns {string} Unique device ID
   */
  static generateDeviceId(userAgent, ipAddress, additionalData = {}) {
    const parser = new UAParser(userAgent);
    const result = parser.getResult();
    
    // Create a unique string from device characteristics
    const deviceString = [
      result.browser.name || 'unknown',
      result.browser.version || 'unknown',
      result.os.name || 'unknown',
      result.os.version || 'unknown',
      result.device.vendor || 'unknown',
      result.device.model || 'unknown',
      result.device.type || 'unknown',
      ipAddress,
      additionalData.screenResolution || '',
      additionalData.timezone || '',
      additionalData.language || ''
    ].join('|');
    
    // Generate a hash-based device ID
    return crypto
      .createHash('sha256')
      .update(deviceString)
      .digest('hex')
      .substring(0, 32); // Use first 32 characters
  }
  
  /**
   * Generate a more detailed device fingerprint for security validation
   * @param {string} userAgent - Browser user agent string
   * @param {string} ipAddress - Client IP address
   * @param {Object} additionalData - Additional device data
   * @returns {string} Device fingerprint hash
   */
  static generateFingerprint(userAgent, ipAddress, additionalData = {}) {
    const parser = new UAParser(userAgent);
    const result = parser.getResult();
    
    // Create a comprehensive fingerprint string
    const fingerprintData = {
      browser: {
        name: result.browser.name,
        version: result.browser.version,
        major: result.browser.major
      },
      engine: {
        name: result.engine.name,
        version: result.engine.version
      },
      os: {
        name: result.os.name,
        version: result.os.version
      },
      device: {
        vendor: result.device.vendor,
        model: result.device.model,
        type: result.device.type
      },
      network: {
        ip: ipAddress
      },
      client: {
        screenResolution: additionalData.screenResolution,
        colorDepth: additionalData.colorDepth,
        timezone: additionalData.timezone,
        language: additionalData.language,
        platform: additionalData.platform,
        cookieEnabled: additionalData.cookieEnabled,
        doNotTrack: additionalData.doNotTrack
      }
    };
    
    const fingerprintString = JSON.stringify(fingerprintData, Object.keys(fingerprintData).sort());
    
    return crypto
      .createHash('sha256')
      .update(fingerprintString)
      .digest('hex');
  }
  
  /**
   * Parse user agent to extract device information
   * @param {string} userAgent - Browser user agent string
   * @returns {Object} Parsed device information
   */
  static parseUserAgent(userAgent) {
    const parser = new UAParser(userAgent);
    const result = parser.getResult();
    
    return {
      browser: {
        name: result.browser.name || 'Unknown Browser',
        version: result.browser.version || 'Unknown Version'
      },
      os: {
        name: result.os.name || 'Unknown OS',
        version: result.os.version || 'Unknown Version'
      },
      device: {
        vendor: result.device.vendor || null,
        model: result.device.model || null,
        type: result.device.type || 'desktop'
      }
    };
  }
  
  /**
   * Generate a human-readable device name
   * @param {string} userAgent - Browser user agent string
   * @returns {string} Human-readable device name
   */
  static generateDeviceName(userAgent) {
    const deviceInfo = this.parseUserAgent(userAgent);
    
    let deviceName = '';
    
    // Add device type and model if available
    if (deviceInfo.device.vendor && deviceInfo.device.model) {
      deviceName = `${deviceInfo.device.vendor} ${deviceInfo.device.model}`;
    } else if (deviceInfo.device.type === 'mobile') {
      deviceName = 'Mobile Device';
    } else if (deviceInfo.device.type === 'tablet') {
      deviceName = 'Tablet Device';
    } else {
      deviceName = 'Desktop Computer';
    }
    
    // Add browser and OS info
    deviceName += ` (${deviceInfo.browser.name} on ${deviceInfo.os.name})`;
    
    return deviceName;
  }
  
  /**
   * Validate if two fingerprints are similar enough to be the same device
   * @param {string} fingerprint1 - First fingerprint
   * @param {string} fingerprint2 - Second fingerprint
   * @returns {boolean} True if fingerprints match
   */
  static validateFingerprint(fingerprint1, fingerprint2) {
    return fingerprint1 === fingerprint2;
  }
  
  /**
   * Extract client IP address from request
   * @param {Object} req - Express request object
   * @returns {string} Client IP address
   */
  static getClientIP(req) {
    return req.ip || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress ||
           (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
           req.headers['x-forwarded-for']?.split(',')[0] ||
           req.headers['x-real-ip'] ||
           '127.0.0.1';
  }
  
  /**
   * Create device session data
   * @param {Object} req - Express request object
   * @param {Object} additionalData - Additional device data from client
   * @returns {Object} Device session data
   */
  static createDeviceSession(req, additionalData = {}) {
    const userAgent = req.headers['user-agent'] || 'Unknown';
    const ipAddress = this.getClientIP(req);
    
    // Use device ID from frontend if provided, otherwise generate one
    const deviceId = additionalData.deviceId || this.generateDeviceId(userAgent, ipAddress, additionalData);
    const fingerprint = this.generateFingerprint(userAgent, ipAddress, additionalData);
    const deviceInfo = this.parseUserAgent(userAgent);
    const deviceName = additionalData.deviceName || this.generateDeviceName(userAgent);
    
    return {
      deviceId,
      deviceName,
      deviceType: deviceInfo.device.type,
      deviceFingerprint: fingerprint,
      ipAddress,
      userAgent,
      browser: deviceInfo.browser,
      os: deviceInfo.os,
      device: deviceInfo.device
    };
  }
}

module.exports = DeviceFingerprint;