import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api';
import {
  Container,
  Typography,
  Paper,
  Box,
  Grid,
  Card,
  CardContent,
  Button,

  Chip,
  CircularProgress,
  Alert,
  Avatar,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField
} from '@mui/material';
import {
  Person,
  Email,
  AdminPanelSettings,
  Security,
  Devices,
  Edit,
  Save,
  Cancel,
  ArrowBack,
  Logout,
  CalendarToday,
  Computer,
  Smartphone,
  Tablet
} from '@mui/icons-material';
import { format } from 'date-fns';

const UserProfile = () => {
  const [userDetails, setUserDetails] = useState(null);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({ name: '', email: '' });
  const [updateLoading, setUpdateLoading] = useState(false);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  
  const { logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchUserData();
  }, []);

  const fetchUserData = async () => {
    try {
      setLoading(true);
      
      // Fetch user details
      const userRes = await api.get('/auth/me');
      setUserDetails(userRes.data.data);
      setEditData({
        name: userRes.data.data.name,
        email: userRes.data.data.email
      });
      
      // Fetch user devices
      const devicesRes = await api.get('/devices');
      setDevices(devicesRes.data.data || []);
      
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to load user data');
      console.error('Error fetching user data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = async () => {
    try {
      setUpdateLoading(true);
      await api.put('/auth/updatedetails', editData);
      await fetchUserData();
      setEditMode(false);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to update profile');
    } finally {
      setUpdateLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const getDeviceIcon = (deviceType) => {
    switch (deviceType?.toLowerCase()) {
      case 'mobile':
        return <Smartphone />;
      case 'tablet':
        return <Tablet />;
      default:
        return <Computer />;
    }
  };

  const formatDate = (dateString) => {
    try {
      return format(new Date(dateString), 'PPP p');
    } catch {
      return 'Invalid date';
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
        <Box display="flex" alignItems="center" gap={2}>
          <IconButton onClick={() => navigate('/')} color="primary">
            <ArrowBack />
          </IconButton>
          <Typography variant="h4" component="h1">
            User Profile
          </Typography>
        </Box>
        <Button
          variant="outlined"
          color="error"
          startIcon={<Logout />}
          onClick={() => setLogoutDialogOpen(true)}
        >
          Logout
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* User Information Card */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: 'fit-content' }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
              <Typography variant="h6" component="h2">
                Personal Information
              </Typography>
              {!editMode ? (
                <IconButton onClick={() => setEditMode(true)} color="primary">
                  <Edit />
                </IconButton>
              ) : (
                <Box display="flex" gap={1}>
                  <IconButton 
                    onClick={handleUpdateProfile} 
                    color="primary"
                    disabled={updateLoading}
                  >
                    <Save />
                  </IconButton>
                  <IconButton 
                    onClick={() => {
                      setEditMode(false);
                      setEditData({
                        name: userDetails?.name || '',
                        email: userDetails?.email || ''
                      });
                    }} 
                    color="secondary"
                  >
                    <Cancel />
                  </IconButton>
                </Box>
              )}
            </Box>

            <Box display="flex" alignItems="center" mb={3}>
              <Avatar sx={{ width: 64, height: 64, mr: 2, bgcolor: 'primary.main' }}>
                {userDetails?.name?.charAt(0)?.toUpperCase() || 'U'}
              </Avatar>
              <Box>
                <Typography variant="h6">
                  {userDetails?.name}
                </Typography>
                {isAdmin && (
                  <Chip 
                    icon={<AdminPanelSettings />} 
                    label="Administrator" 
                    color="primary" 
                    size="small" 
                  />
                )}
              </Box>
            </Box>

            <List>
              <ListItem>
                <ListItemIcon>
                  <Person />
                </ListItemIcon>
                <ListItemText 
                  primary="Name" 
                  secondary={
                    editMode ? (
                      <TextField
                        value={editData.name}
                        onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                        size="small"
                        fullWidth
                        sx={{ mt: 1 }}
                      />
                    ) : (
                      userDetails?.name
                    )
                  } 
                />
              </ListItem>
              
              <ListItem>
                <ListItemIcon>
                  <Email />
                </ListItemIcon>
                <ListItemText 
                  primary="Email" 
                  secondary={
                    editMode ? (
                      <TextField
                        value={editData.email}
                        onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                        size="small"
                        fullWidth
                        type="email"
                        sx={{ mt: 1 }}
                      />
                    ) : (
                      userDetails?.email
                    )
                  } 
                />
              </ListItem>
              
              <ListItem>
                <ListItemIcon>
                  <CalendarToday />
                </ListItemIcon>
                <ListItemText 
                  primary="Member Since" 
                  secondary={userDetails?.createdAt ? formatDate(userDetails.createdAt) : 'Unknown'} 
                />
              </ListItem>
            </List>
          </Paper>
        </Grid>

        {/* Device Security Card */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
              <Typography variant="h6" component="h2">
                Device Security
              </Typography>
              <Button
                variant="outlined"
                startIcon={<Security />}
                onClick={() => navigate('/devices')}
                size="small"
              >
                Manage
              </Button>
            </Box>

            <Box mb={2}>
              <Typography variant="body2" color="text.secondary">
                Active Devices: {devices.length}
              </Typography>
            </Box>

            {devices.length === 0 ? (
              <Box textAlign="center" py={2}>
                <Devices sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
                <Typography variant="body2" color="text.secondary">
                  No active devices found
                </Typography>
              </Box>
            ) : (
              <Box>
                {devices.slice(0, 3).map((device) => (
                  <Card key={device.id} variant="outlined" sx={{ mb: 1, p: 1 }}>
                    <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
                      <Box display="flex" alignItems="center" gap={2}>
                        {getDeviceIcon(device.deviceType)}
                        <Box flex={1}>
                          <Typography variant="body2" fontWeight="medium">
                            {device.deviceName}
                            {device.isCurrent && (
                              <Chip 
                                label="Current" 
                                size="small" 
                                color="success" 
                                sx={{ ml: 1 }} 
                              />
                            )}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Last active: {formatDate(device.lastActivity)}
                          </Typography>
                        </Box>
                      </Box>
                    </CardContent>
                  </Card>
                ))}
                {devices.length > 3 && (
                  <Typography variant="body2" color="text.secondary" textAlign="center" mt={1}>
                    +{devices.length - 3} more devices
                  </Typography>
                )}
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Quick Actions Card */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" component="h2" mb={3}>
              Quick Actions
            </Typography>
            <Box display="flex" gap={2} flexWrap="wrap">
              <Button
                variant="outlined"
                startIcon={<Security />}
                onClick={() => navigate('/devices')}
              >
                Manage Devices
              </Button>
              {isAdmin && (
                <Button
                  variant="outlined"
                  startIcon={<AdminPanelSettings />}
                  onClick={() => navigate('/admin')}
                >
                  Admin Dashboard
                </Button>
              )}
              <Button
                variant="outlined"
                onClick={() => navigate('/')}
              >
                Back to Library
              </Button>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Logout Confirmation Dialog */}
      <Dialog open={logoutDialogOpen} onClose={() => setLogoutDialogOpen(false)}>
        <DialogTitle>Confirm Logout</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to logout? You will need to sign in again to access your account.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLogoutDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleLogout} color="error" variant="contained">
            Logout
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default UserProfile;