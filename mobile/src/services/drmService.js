import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { deviceFingerprint } from '../utils/deviceFingerprint';
import { apiService } from './apiService';

class DRMService {
  constructor() {
    this.activeStreams = new Map();
    this.securityChecks = new Map();
  }

  async initializeSecurePlayback(audioFileId) {
    try {
      // Generate device fingerprint
      const fingerprint = await deviceFingerprint.generateFingerprint();
      
      // Create DRM session with backend
      const sessionResponse = await apiService.createDRMSession(audioFileId);
      const sessionData = sessionResponse.data || sessionResponse;
      
      // Store stream session
      this.activeStreams.set(audioFileId, {
        sessionToken: sessionData.sessionToken,
        expiresAt: Date.now() + (sessionData.expiresIn || 30 * 60 * 1000),
        fingerprint: fingerprint.fingerprint,
        duration: sessionData.duration
      });

      return sessionData;
    } catch (error) {
      console.error('DRM initialization failed:', error);
      throw error;
    }
  }

  async createSecureAudioSource(audioFileId, startTime = 0) {
    const streamSession = this.activeStreams.get(audioFileId);
    if (!streamSession) {
      throw new Error('No active stream session for this audio file');
    }

    // Check if session is still valid
    if (Date.now() > streamSession.expiresAt) {
      throw new Error('Stream session expired');
    }

    // For seeking, use signed URL; otherwise use DRM session stream
    if (startTime > 0) {
      return await this.createSignedAudioSource(audioFileId, startTime);
    }

    // Create secure streaming URL with session token
    const secureUrl = apiService.getDRMStreamUrl(streamSession.sessionToken);
    
    return {
      uri: secureUrl,
      headers: {
        'Authorization': `Bearer ${await AsyncStorage.getItem('authToken')}`,
        'X-Device-Fingerprint': streamSession.fingerprint
      }
    };
  }

  async validateStreamIntegrity(audioFileId) {
    const streamSession = this.activeStreams.get(audioFileId);
    if (!streamSession) {
      return false;
    }

    try {
      // Verify device fingerprint hasn't changed
      const currentFingerprint = await deviceFingerprint.generateFingerprint();
      if (currentFingerprint.fingerprint !== streamSession.fingerprint) {
        console.warn('Device fingerprint mismatch - potential security breach');
        this.terminateStream(audioFileId);
        return false;
      }

      // Check session expiration
      if (Date.now() > streamSession.expiresAt) {
        this.terminateStream(audioFileId);
        return false;
      }

      // Validate DRM session is still active
      try {
        await apiService.getDRMStatus(audioFileId);
      } catch (error) {
        console.warn('DRM session validation failed:', error);
        this.terminateStream(audioFileId);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Stream integrity validation failed:', error);
      this.terminateStream(audioFileId);
      return false;
    }
  }

  async startSecurityMonitoring(audioFileId) {
    // Periodic security checks every 30 seconds
    const securityInterval = setInterval(async () => {
      const isValid = await this.validateStreamIntegrity(audioFileId);
      if (!isValid) {
        clearInterval(securityInterval);
        // Notify the audio context to stop playback
        this.onSecurityViolation?.(audioFileId);
      }
    }, 30000);

    this.securityChecks.set(audioFileId, securityInterval);
  }

  terminateStream(audioFileId) {
    // Clear active stream
    this.activeStreams.delete(audioFileId);
    
    // Clear security monitoring
    const securityInterval = this.securityChecks.get(audioFileId);
    if (securityInterval) {
      clearInterval(securityInterval);
      this.securityChecks.delete(audioFileId);
    }
  }

  async cleanupExpiredSessions() {
    const now = Date.now();
    for (const [audioFileId, session] of this.activeStreams.entries()) {
      if (now > session.expiresAt) {
        this.terminateStream(audioFileId);
      }
    }
  }

  // Create signed URL source for seeking/chapters
  async createSignedAudioSource(audioFileId, startTime = 0, endTime = -1) {
    try {
      const signedResponse = await apiService.generateSignedUrl(audioFileId, {
        startTime,
        endTime,
        expiresIn: 30 * 60 * 1000 // 30 minutes
      });
      
      const signedData = signedResponse.data || signedResponse;
      
      return {
        uri: signedData.signedUrl,
        headers: {
          'Authorization': `Bearer ${await AsyncStorage.getItem('authToken')}`,
          'X-Device-Fingerprint': (await deviceFingerprint.generateFingerprint()).fingerprint
        }
      };
    } catch (error) {
      console.error('Failed to create signed audio source:', error);
      throw error;
    }
  }

  setSecurityViolationCallback(callback) {
    this.onSecurityViolation = callback;
  }
}

export const drmService = new DRMService();
