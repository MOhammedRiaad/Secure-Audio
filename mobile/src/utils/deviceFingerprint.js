import * as Device from 'expo-device';
import * as Application from 'expo-application';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

class DeviceFingerprint {
  async generateFingerprint() {
    try {
      const deviceInfo = {
        platform: Platform.OS,
        version: Platform.Version,
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
