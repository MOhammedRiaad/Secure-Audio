import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Conditionally import expo modules only for non-web platforms
let Device = null;
let Application = null;
if (Platform.OS !== 'web') {
  Device = require('expo-device');
  Application = require('expo-application');
}

class DeviceFingerprint {
  async generateFingerprint() {
    try {
      let deviceInfo = {
        platform: Platform.OS,
        version: Platform.Version,
      };

      // Handle web platform differently
      if (Platform.OS === 'web') {
        deviceInfo = {
          ...deviceInfo,
          deviceName: 'Web Browser',
          modelName: 'Browser',
          brand: 'Web',
          manufacturer: 'Browser',
          osName: 'Web',
          osVersion: navigator.userAgent,
          applicationId: 'com.secureaudio.web',
          applicationName: 'SecureAudio Web',
          nativeApplicationVersion: '1.0.0',
        };
      } else {
        deviceInfo = {
          ...deviceInfo,
          deviceName: Device.deviceName,
          modelName: Device.modelName,
          brand: Device.brand,
          manufacturer: Device.manufacturer,
          osName: Device.osName,
          osVersion: Device.osVersion,
          applicationId: Application.applicationId,
          applicationName: Application.applicationName,
          nativeApplicationVersion: Application.nativeApplicationVersion,
        };
      }

      // Get or create a unique device ID
      let deviceId = await AsyncStorage.getItem('deviceId');
      if (!deviceId) {
        deviceId = this.generateUniqueId();
        await AsyncStorage.setItem('deviceId', deviceId);
      }

      deviceInfo.deviceId = deviceId;

      // Create a hash-like fingerprint
      const fingerprintString = JSON.stringify(deviceInfo);
      const fingerprint = this.simpleHash(fingerprintString);

      return {
        fingerprint,
        deviceInfo,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('Error generating device fingerprint:', error);
      throw error;
    }
  }

  generateUniqueId() {
    return 'mobile_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  async validateDevice(serverFingerprint) {
    const currentFingerprint = await this.generateFingerprint();
    return currentFingerprint.fingerprint === serverFingerprint;
  }
}

export const deviceFingerprint = new DeviceFingerprint();
