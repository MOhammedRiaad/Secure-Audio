import React, { createContext, useState, useEffect, useContext } from 'react';
import api from '../api';

const AuthContext = createContext();

export const useAuth = () => {
  return useContext(AuthContext);
};

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [isAdmin, setIsAdmin] = useState(false);

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

  // Load user on mount or when token changes
  useEffect(() => {
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
  const login = async (email, password) => {
    try {
      console.log('Attempting login with email:', email);
      
      // Use the API client for login to maintain consistent flow
      // We need to use a direct URL here to avoid circular dependencies
      const response = await api.post(
        '/auth/login', 
        { email, password }
      );
      
      const { data } = response;
      
      if (!data.success) {
        throw new Error(data.message || 'Login failed');
      }
      
      console.log('Login response:', data);
      
      // Get the token from the response body
      const { token, user } = data;
      console.log('Received token:', token ? 'Token received' : 'No token received');
      
      if (!token) {
        throw new Error('No token received from server');
      }
      
      // Set the token in localStorage and state
      setAuthToken(token);
      console.log('Token set in localStorage:', localStorage.getItem('token'));
      
      // Set user data
      setCurrentUser(user);
      setIsAdmin(checkAdminStatus(user));
      
      return { success: true };
    } catch (err) {
      console.error('Login error:', err);
      return { 
        success: false, 
        error: err.response?.data?.error?.message || err.response?.data?.message || 'Login failed. Please check your credentials.' 
      };
    }
  };

  // Logout user
  const logout = () => {
    setAuthToken(null);
    setCurrentUser(null);
    setIsAdmin(false);
  };

  const value = {
    currentUser,
    isAuthenticated: !!currentUser,
    isAdmin,
    loading,
    login,
    logout,
    register,
    setCurrentUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
