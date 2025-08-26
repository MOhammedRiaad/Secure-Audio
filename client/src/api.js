import axios from 'axios';
import deviceFingerprint from './utils/deviceFingerprint';

// Global logout handler - will be set by AuthContext
let globalLogoutHandler = null;

// Function to set the global logout handler
export const setGlobalLogoutHandler = (handler) => {
  globalLogoutHandler = handler;
};

// Create axios instance with base URL
const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // This ensures cookies are sent with requests
});

// Add a request interceptor to add the auth token and device ID to requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    
    // Add authorization token
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    } else {
      console.warn('No token found in localStorage');
    }
    
    // Add device ID header for device tracking
    config.headers['X-Device-ID'] = deviceFingerprint.deviceId;
    
    console.log('Request headers:', config.headers);
    return config;
  },
  (error) => {
    console.error('Request interceptor error:', error);
    return Promise.reject(error);
  }
);

// Add a response interceptor to handle 401 and 403 responses
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Response Error:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      message: error.response?.data?.message,
      url: error.config?.url
    });
    
    if (error.response) {
      const { status } = error.response;
      
      // Handle 401 Unauthorized - Invalid or missing token
      if (status === 401) {
        console.warn('401 Unauthorized - Invalid or missing token, redirecting to login');
        handleLogout('Invalid or missing authentication token');
      }
      
      // Handle 403 Forbidden - Token expired or insufficient permissions
      else if (status === 403) {
        const errorMessage = error.response.data?.message || error.response.data?.error;
        
        // Check if it's a token expiry issue
        if (errorMessage && (
          errorMessage.includes('expired') || 
          errorMessage.includes('Token has expired') ||
          errorMessage.includes('Session expired')
        )) {
          console.warn('403 Forbidden - Token expired, forcing logout');
          handleLogout('Your session has expired. Please log in again.');
        } else {
          console.warn('403 Forbidden - Insufficient permissions:', errorMessage);
          // Don't force logout for permission issues, just show the error
        }
      }
    }
    
    return Promise.reject(error);
  }
);

// Helper function to handle logout
function handleLogout(reason = 'Authentication required') {
  console.log('Handling forced logout:', reason);
  
  // Use the global logout handler if available (from AuthContext)
  if (globalLogoutHandler) {
    try {
      globalLogoutHandler(reason);
      return;
    } catch (error) {
      console.error('Global logout handler failed:', error);
      // Fall back to manual cleanup
    }
  }
  
  // Fallback: Clear token from localStorage manually
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('deviceSession');
  
  // Show notification if possible
  if (window.showNotification) {
    window.showNotification(reason, 'warning');
  }
  
  // Redirect to login page
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

export default api;
