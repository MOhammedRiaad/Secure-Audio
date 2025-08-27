import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = 'http://localhost:5000/api/v1'; // Update this to your server URL

class ApiService {
  constructor() {
    this.api = axios.create({
      baseURL: API_BASE_URL,
      timeout: 10000,
    });

    // Add request interceptor to include auth token
    this.api.interceptors.request.use(async (config) => {
      const token = await AsyncStorage.getItem('authToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Add response interceptor for error handling
    this.api.interceptors.response.use(
      (response) => response.data,
      (error) => {
        if (error.response?.status === 401) {
          // Token expired or invalid
          AsyncStorage.removeItem('authToken');
        }
        throw error;
      }
    );
  }

  // Auth endpoints
  async login(email, password, deviceData = null, deviceApproved = false) {
    return await this.api.post('/auth/login', { 
      email, 
      password, 
      deviceData,
      deviceApproved 
    });
  }

  async verifyToken(token) {
    return await this.api.get('/auth/verify', {
      headers: { Authorization: `Bearer ${token}` }
    });
  }

  // Audio file endpoints (backend uses /files not /audio-files)
  async getAudioFiles() {
    return await this.api.get('/files');
  }

  async getAudioFile(id) {
    return await this.api.get(`/files/${id}`);
  }

  // DRM Session endpoints (actual backend routes)
  async createDRMSession(audioFileId) {
    return await this.api.post(`/drm/session/${audioFileId}`);
  }

  // DRM Stream with session token
  async getDRMStreamUrl(sessionToken) {
    return `${API_BASE_URL}/drm/stream/${sessionToken}`;
  }

  // Generate signed URL for timestamp-based streaming
  async generateSignedUrl(audioFileId, options = {}) {
    return await this.api.post(`/drm/signed-url/${audioFileId}`, options);
  }

  // Get DRM status
  async getDRMStatus(audioFileId) {
    return await this.api.get(`/drm/status/${audioFileId}`);
  }

  // Chapter endpoints (backend uses /files not /audio-files)
  async getChapters(audioFileId) {
    return await this.api.get(`/files/${audioFileId}/chapters`);
  }

  // Checkpoint endpoints
  async saveCheckpoint(audioFileId, position) {
    return await this.api.post('/checkpoints', {
      fileId: audioFileId,
      position
    });
  }

  async getCheckpoint(audioFileId) {
    return await this.api.get(`/checkpoints?fileId=${audioFileId}`);
  }

  // Verify token endpoint
  async verifyToken() {
    return await this.api.get('/auth/me');
  }
}

export const apiService = new ApiService();
