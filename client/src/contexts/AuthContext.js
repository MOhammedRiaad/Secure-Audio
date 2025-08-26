import React, { createContext, useState, useEffect, useContext } from 'react';
import api, { setGlobalLogoutHandler } from '../api';
import deviceFingerprint from '../utils/deviceFingerprint';

const AuthContext = createContext();

export const useAuth = () => {
  return useContext(AuthContext);
};

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [isAdmin, setIsAdmin] = useState(false);
  const [deviceSession, setDeviceSession] = useState(null);
  const [deviceWarnings, setDeviceWarnings] = useState([]);
  const [showDeviceApproval, setShowDeviceApproval] = useState(false);
  const [pendingLoginData, setPendingLoginData] = useState(null);

  // Set auth token for API requests
  const setAuthToken = (token) => {
    if (token) {
      localStorage.setItem('token', token);
      setToken(token);
    } else {
      localStorage.removeItem('token');
      setToken(null);
    }
  };

  // Check if user is admin
  const checkAdminStatus = (user) => {
    return user && (user.isAdmin || user.role === 'admin');
  };

  // Force logout without API call (for expired tokens or security issues)
  const forceLogout = (reason = 'Session expired') => {
    console.log('Force logout triggered:', reason);
    
    // Clear local state immediately
    setAuthToken(null);
    setCurrentUser(null);
    setIsAdmin(false);
    setDeviceSession(null);
    setDeviceWarnings([]);
    setPendingLoginData(null);
    setShowDeviceApproval(false);
    
    // Note: Don't make API call since token is likely invalid
    console.log('User logged out due to:', reason);
  };

  // Load user on mount or when token changes
  useEffect(() => {
    // Register the force logout handler with the API interceptor
    setGlobalLogoutHandler(forceLogout);
    
    const loadUser = async () => {
      if (token) {
        try {
          console.log('Attempting to load user data with token');
          const res = await api.get('/auth/me');
          console.log('User data response:', res.data);
          const user = res.data.data;
          setCurrentUser(user);
          setIsAdmin(checkAdminStatus(user));
        } catch (err) {
          console.error('Failed to load user', err);
          console.error('Error details:', err.response?.data || err.message);
          setAuthToken(null);
          setCurrentUser(null);
          setIsAdmin(false);
        }
      } else {
        setCurrentUser(null);
        setIsAdmin(false);
      }
      setLoading(false);
    };

    loadUser();
  }, [token]);

  // Register user
  const register = async (userData) => {
    try {
      const res = await api.post('/auth/register', userData);
      const { token, user } = res.data;
      setToken(token);
      setCurrentUser(user);
      setAuthToken(token);
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err.response?.data?.error?.message || err.response?.data?.message || 'Registration failed',
      };
    }
  };

  // Login user
  const login = async (email, password, deviceApproved = false) => {
    try {
      console.log('AuthContext: Attempting login with email:', email);
      
      // Include device information in login request
      const deviceInfo = deviceFingerprint.getDeviceInfo();
      const loginData = {
        email,
        password,
        deviceApproved,
        deviceData: {
          deviceId: deviceFingerprint.getOrCreateDeviceId(),
          deviceFingerprint: deviceFingerprint.getDeviceFingerprint(),
          deviceName: deviceFingerprint.getDeviceName(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          language: navigator.language,
          platform: navigator.platform,
          cookieEnabled: navigator.cookieEnabled,
          doNotTrack: navigator.doNotTrack
        }
      };
      
      console.log('AuthContext: Making API call to /auth/login with device info');
      const response = await api.post('/auth/login', loginData);
      
      console.log('AuthContext: Raw response:', response);
      const { data } = response;
      console.log('AuthContext: Response data:', data);
      
      if (!data.success) {
        console.error('AuthContext: Login failed - success is false');
        
        // Check if this is a device approval required error
        if (data.requiresDeviceApproval) {
          setPendingLoginData({ email, password });
          setShowDeviceApproval(true);
          return { 
            success: false, 
            requiresDeviceApproval: true,
            message: data.message || 'Device approval required'
          };
        }
        
        throw new Error(data.message || 'Login failed');
      }
      
      console.log('AuthContext: Login response successful:', data);
      
      // Get the token and device session from the response
      const { token, user, deviceSession: sessionData, warnings } = data;
      console.log('AuthContext: Extracted token:', token ? 'Token received' : 'No token received');
      console.log('AuthContext: Extracted user:', user);
      console.log('AuthContext: Device session:', sessionData);
      console.log('AuthContext: Warnings:', warnings);
      
      if (!token) {
        throw new Error('No token received from server');
      }
      
      // Set the token in localStorage and state
      setAuthToken(token);
      console.log('Token set in localStorage:', localStorage.getItem('token'));
      
      // Set user data
      setCurrentUser(user);
      setIsAdmin(checkAdminStatus(user));
      
      // Set device session information
      if (sessionData) {
        setDeviceSession(sessionData);
      }
      
      // Set device warnings if any
      if (warnings && warnings.length > 0) {
        setDeviceWarnings(warnings);
      }
      
      // Clear pending login data and hide approval modal
      setPendingLoginData(null);
      setShowDeviceApproval(false);
      
      return { 
        success: true, 
        deviceSession: sessionData,
        warnings: warnings || []
      };
    } catch (err) {
      console.error('Login error:', err);
      return { 
        success: false, 
        error: err.response?.data?.error?.message || err.response?.data?.message || 'Login failed. Please check your credentials.' 
      };
    }
  };

  // Handle device approval
  const handleDeviceApproval = async (approved) => {
    if (!pendingLoginData) {
      return { success: false, error: 'No pending login data' };
    }

    if (!approved) {
      // User cancelled device approval
      setPendingLoginData(null);
      setShowDeviceApproval(false);
      return { success: false, cancelled: true };
    }

    // User approved device, proceed with login
    const { email, password } = pendingLoginData;
    return await login(email, password, true);
  };

  // Cancel device approval
  const cancelDeviceApproval = () => {
    setPendingLoginData(null);
    setShowDeviceApproval(false);
  };

  // Logout user
  const logout = async () => {
    try {
      // Call logout endpoint to clean up server-side session
      await api.post('/auth/logout');
    } catch (error) {
      console.error('Logout API call failed:', error);
    }
    
    // Clear local state
    setAuthToken(null);
    setCurrentUser(null);
    setIsAdmin(false);
    setDeviceSession(null);
    setDeviceWarnings([]);
  };

  // Clear device warnings
  const clearDeviceWarnings = () => {
    setDeviceWarnings([]);
  };
  
  // Get active devices
  const getActiveDevices = async () => {
    try {
      const response = await api.get('/devices');
      return response.data;
    } catch (error) {
      console.error('Failed to fetch active devices:', error);
      throw error;
    }
  };
  
  // Deactivate device
  const deactivateDevice = async (deviceId) => {
    try {
      const response = await api.delete(`/devices/${deviceId}`);
      return response.data;
    } catch (error) {
      console.error('Failed to deactivate device:', error);
      throw error;
    }
  };
  
  // Deactivate all other devices
  const deactivateOtherDevices = async () => {
    try {
      const response = await api.delete('/devices/others');
      return response.data;
    } catch (error) {
      console.error('Failed to deactivate other devices:', error);
      throw error;
    }
  };

  const value = {
    currentUser,
    isAuthenticated: !!currentUser,
    isAdmin,
    loading,
    token,
    deviceSession,
    deviceWarnings,
    showDeviceApproval,
    pendingLoginData,
    login,
    logout,
    forceLogout,
    register,
    setCurrentUser,
    clearDeviceWarnings,
    getActiveDevices,
    deactivateDevice,
    deactivateOtherDevices,
    handleDeviceApproval,
    cancelDeviceApproval,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
