import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiService } from '../services/apiService';
import { deviceFingerprint } from '../utils/deviceFingerprint';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showDeviceApproval, setShowDeviceApproval] = useState(false);
  const [pendingLoginData, setPendingLoginData] = useState(null);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const token = await AsyncStorage.getItem('authToken');
      if (token) {
        // Verify token with backend
        const userData = await apiService.verifyToken();
        setUser(userData.data || userData);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      await AsyncStorage.removeItem('authToken');
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password, deviceApproved = false) => {
    try {
      // Generate device fingerprint for DRM
      const fingerprint = await deviceFingerprint.generateFingerprint();
      
      const response = await apiService.login(email, password, fingerprint, deviceApproved);
      
      // Check if device approval is required
      if (response.requiresDeviceApproval) {
        setPendingLoginData({ email, password, fingerprint });
        setShowDeviceApproval(true);
        return { 
          success: false, 
          requiresDeviceApproval: true,
          message: response.message
        };
      }
      
      const { token, user: userData } = response;
      
      await AsyncStorage.setItem('authToken', token);
      setUser(userData);
      
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.message || 'Login failed' 
      };
    }
  };

  const handleDeviceApproval = async (approved) => {
    if (!approved || !pendingLoginData) {
      setShowDeviceApproval(false);
      setPendingLoginData(null);
      return { success: false, cancelled: true };
    }

    try {
      const { email, password, fingerprint } = pendingLoginData;
      const response = await apiService.login(email, password, fingerprint, true);
      
      const { token, user: userData } = response;
      
      await AsyncStorage.setItem('authToken', token);
      setUser(userData);
      
      setShowDeviceApproval(false);
      setPendingLoginData(null);
      
      return { success: true };
    } catch (error) {
      setShowDeviceApproval(false);
      setPendingLoginData(null);
      return { 
        success: false, 
        error: error.response?.data?.message || 'Device approval failed' 
      };
    }
  };

  const cancelDeviceApproval = () => {
    setShowDeviceApproval(false);
    setPendingLoginData(null);
  };

  const logout = async () => {
    try {
      await AsyncStorage.removeItem('authToken');
      setUser(null);
      setShowDeviceApproval(false);
      setPendingLoginData(null);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const value = {
    user,
    login,
    logout,
    loading,
    showDeviceApproval,
    handleDeviceApproval,
    cancelDeviceApproval
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
