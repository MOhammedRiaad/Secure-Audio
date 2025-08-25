import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
  Container, 
  Box, 
  Typography, 
  TextField, 
  Button, 
  Paper, 
  Alert, 
  CircularProgress,
  Link as MuiLink,
  Divider
} from '@mui/material';
import { AdminPanelSettings } from '@mui/icons-material';
import DeviceWarnings from '../components/DeviceWarnings';
import DeviceApprovalModal from '../components/DeviceApprovalModal';

const Login = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { 
    login, 
    isAuthenticated, 
    deviceWarnings, 
    isAdmin, 
    showDeviceApproval, 
    handleDeviceApproval, 
    cancelDeviceApproval 
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  const from = location.state?.from?.pathname || '/';
  
  useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, from]);
  
  const { email, password } = formData;
  
  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Clear previous errors
    setError('');
    
    // Validate inputs
    if (!email || !password) {
      return setError('Please enter both email and password');
    }
    
    // Basic email validation
    if (!/\S+@\S+\.\S+/.test(email)) {
      return setError('Please enter a valid email address');
    }
    
    try {
      setLoading(true);
      const result = await login(email, password);
      
      if (result.success) {
        console.log('Login successful, redirecting...');
        // Force a refresh to ensure the token is picked up by the API client
        window.location.href = from;
      } else if (result.requiresDeviceApproval) {
        // Device approval is required, modal will be shown automatically
        setError('');
      } else {
        const { error } = result;
        // More specific error messages based on the error
        if (error.includes('credentials') || error.includes('Invalid email or password')) {
          setError('Invalid email or password');
        } else if (error.includes('network') || error.includes('connect')) {
          setError('Unable to connect to server. Please try again later.');
        } else if (error.includes('token')) {
          setError('Authentication error. Please try again.');
        } else {
          setError(error || 'Login failed. Please try again.');
        }
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  // Handle device approval
  const handleDeviceApprovalResponse = async (approved) => {
    try {
      setLoading(true);
      const result = await handleDeviceApproval(approved);
      
      if (result.success) {
        console.log('Device approved and login successful, redirecting...');
        window.location.href = from;
      } else if (result.cancelled) {
        setError('Login cancelled. You can try logging in from another device.');
      } else {
        setError(result.error || 'Device approval failed. Please try again.');
      }
    } catch (err) {
      console.error('Device approval error:', err);
      setError('An unexpected error occurred during device approval.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container component="main" maxWidth="xs">
      <Box
        sx={{
          marginTop: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Paper elevation={3} sx={{ p: 4, width: '100%' }}>
          <Typography component="h1" variant="h5" align="center" gutterBottom>
            Sign in
          </Typography>
          
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          
          {/* Show device warnings if user is authenticated */}
          {isAuthenticated && deviceWarnings && deviceWarnings.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <DeviceWarnings />
            </Box>
          )}
          
          <Box component="form" onSubmit={handleSubmit} noValidate>
            <TextField
              margin="normal"
              required
              fullWidth
              id="email"
              label="Email Address"
              name="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={handleChange}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="password"
              label="Password"
              type="password"
              id="password"
              autoComplete="current-password"
              value={password}
              onChange={handleChange}
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 2 }}
              disabled={loading}
            >
              {loading ? <CircularProgress size={24} /> : 'Sign In'}
            </Button>
            
            {/* Admin Dashboard Button - shown after successful login for admin users */}
            {isAuthenticated && isAdmin && (
              <>
                <Divider sx={{ my: 2 }} />
                <Button
                  fullWidth
                  variant="outlined"
                  color="primary"
                  startIcon={<AdminPanelSettings />}
                  onClick={() => navigate('/admin')}
                  sx={{ mb: 2 }}
                >
                  Go to Admin Dashboard
                </Button>
              </>
            )}
            
            <Box sx={{ textAlign: 'center', mt: 2 }}>
              <MuiLink component={Link} to="/register" variant="body2">
                Don't have an account? Sign Up
              </MuiLink>
            </Box>
          </Box>
        </Paper>
      </Box>
      
      {/* Device Approval Modal */}
      <DeviceApprovalModal
        open={showDeviceApproval}
        onApprove={() => handleDeviceApprovalResponse(true)}
        onCancel={() => handleDeviceApprovalResponse(false)}
        loading={loading}
      />
    </Container>
  );
};

export default Login;
