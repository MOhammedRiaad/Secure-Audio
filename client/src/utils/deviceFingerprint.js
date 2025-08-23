/**
 * Frontend Device Fingerprinting Utility
 * Generates unique device identifiers and manages device sessions
 */

class DeviceFingerprint {
  constructor() {
    this.deviceId = this.getOrCreateDeviceId();
  }

  /**
   * Get or create a unique device ID
   * @returns {string} Device ID
   */
  getOrCreateDeviceId() {
    let deviceId = localStorage.getItem('deviceId');
    
    if (!deviceId) {
      deviceId = this.generateDeviceId();
      localStorage.setItem('deviceId', deviceId);
    }
    
    return deviceId;
  }

  /**
   * Generate a unique device ID based on browser characteristics
   * @returns {string} Generated device ID
   */
  generateDeviceId() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillText('Device fingerprint', 2, 2);
    const canvasFingerprint = canvas.toDataURL();
    
    const fingerprint = {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      cookieEnabled: navigator.cookieEnabled,
      doNotTrack: navigator.doNotTrack,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      screen: `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`,
      canvas: this.hashCode(canvasFingerprint),
      timestamp: Date.now(),
      random: Math.random().toString(36).substring(2, 15)
    };
    
    const fingerprintString = JSON.stringify(fingerprint);
    return this.hashCode(fingerprintString).toString();
  }

  /**
   * Generate hash code from string
   * @param {string} str - String to hash
   * @returns {number} Hash code
   */
  hashCode(str) {
    let hash = 0;
    if (str.length === 0) return hash;
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return Math.abs(hash);
  }

  /**
   * Get current device information
   * @returns {Object} Device information
   */
  getDeviceInfo() {
    const userAgent = navigator.userAgent;
    
    // Simple browser detection
    let browser = 'Unknown';
    if (userAgent.includes('Chrome')) browser = 'Chrome';
    else if (userAgent.includes('Firefox')) browser = 'Firefox';
    else if (userAgent.includes('Safari')) browser = 'Safari';
    else if (userAgent.includes('Edge')) browser = 'Edge';
    
    // Simple OS detection
    let os = 'Unknown';
    if (userAgent.includes('Windows')) os = 'Windows';
    else if (userAgent.includes('Mac')) os = 'macOS';
    else if (userAgent.includes('Linux')) os = 'Linux';
    else if (userAgent.includes('Android')) os = 'Android';
    else if (userAgent.includes('iOS')) os = 'iOS';
    
    // Device type detection
    let deviceType = 'Desktop';
    if (/Mobi|Android/i.test(userAgent)) deviceType = 'Mobile';
    else if (/Tablet|iPad/i.test(userAgent)) deviceType = 'Tablet';
    
    return {
      deviceId: this.deviceId,
      browser,
      os,
      deviceType,
      userAgent,
      language: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      screen: `${window.screen.width}x${window.screen.height}`
    };
  }

  /**
   * Generate device name based on browser and OS
   * @returns {string} Human-readable device name
   */
  getDeviceName() {
    const info = this.getDeviceInfo();
    return `${info.browser} on ${info.os}`;
  }

  /**
   * Clear device ID (for logout or reset)
   */
  clearDeviceId() {
    localStorage.removeItem('deviceId');
    this.deviceId = this.generateDeviceId();
    localStorage.setItem('deviceId', this.deviceId);
  }

  /**
   * Get device fingerprint for additional security
   * @returns {string} Device fingerprint
   */
  getDeviceFingerprint() {
    const info = this.getDeviceInfo();
    const fingerprintData = {
      userAgent: info.userAgent,
      language: info.language,
      timezone: info.timezone,
      screen: info.screen,
      platform: navigator.platform
    };
    
    const fingerprintString = JSON.stringify(fingerprintData);
    return this.hashCode(fingerprintString).toString();
  }
}

// Create singleton instance
const deviceFingerprint = new DeviceFingerprint();

export default deviceFingerprint;