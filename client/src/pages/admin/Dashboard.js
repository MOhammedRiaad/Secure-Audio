import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../../api';
import {
  Container,
  Typography,
  Grid,
  Paper,
  Box,
  Button,
  CircularProgress,
} from '@mui/material';
import {
  People as PeopleIcon,
  Audiotrack as AudiotrackIcon,
  BarChart as BarChartIcon,
  ArrowBack as ArrowBackIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';

const AdminDashboard = () => {
  const [stats, setStats] = useState({
    users: 0,
    audioFiles: 0,
    totalPlayTime: 0,
    recentUploads: [],
    publicFiles: 0,
    privateFiles: 0,
    totalSize: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        // In a real app, you would fetch these stats from your API
        const [usersRes, filesRes] = await Promise.all([
          api.get('/admin/users/count'),
          api.get('/admin/files/stats'),
        ]);

        setStats({
          users: usersRes.data.data.count || 0,
          audioFiles: filesRes.data.data.fileCount || 0,
          totalPlayTime: filesRes.data.data.totalDuration || 0,
          recentUploads: filesRes.data.data.recentUploads || [],
          publicFiles: filesRes.data.data.publicFiles || 0,
          privateFiles: filesRes.data.data.privateFiles || 0,
          totalSize: filesRes.data.data.totalSize || 0,
        });
      } catch (err) {
        setError(err.response?.data?.error?.message || err.response?.data?.message || 'Failed to load dashboard statistics');
        console.error('Error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const formatDuration = (seconds) => {
    if (!seconds) return '0:00';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
    }
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
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
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate('/')}
        sx={{ mb: 2 }}
      >
        Back to Library
      </Button>
      <Typography variant="h4" component="h1" gutterBottom>
        Admin Dashboard
      </Typography>
      
      {error && (
        <Box mb={3}>
          <Typography color="error">{error}</Typography>
        </Box>
      )}
      
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={3}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Box display="flex" alignItems="center" mb={2}>
              <PeopleIcon color="primary" sx={{ fontSize: 40, mr: 2 }} />
              <Box>
                <Typography variant="h4">{stats.users}</Typography>
                <Typography variant="body2" color="text.secondary">Total Users</Typography>
              </Box>
            </Box>
            <Button
              component={Link}
              to="/admin/users"
              variant="outlined"
              fullWidth
              sx={{ mt: 2 }}
            >
              Manage Users
            </Button>
          </Paper>
        </Grid>
        
        <Grid item xs={12} md={3}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Box display="flex" alignItems="center" mb={2}>
              <AudiotrackIcon color="primary" sx={{ fontSize: 40, mr: 2 }} />
              <Box>
                <Typography variant="h4">{stats.audioFiles}</Typography>
                <Typography variant="body2" color="text.secondary">Audio Files</Typography>
                <Typography variant="caption" color="text.secondary">
                  {stats.publicFiles} public • {stats.privateFiles} private
                </Typography>
              </Box>
            </Box>
            <Button
              component={Link}
              to="/admin/files"
              variant="outlined"
              fullWidth
              sx={{ mt: 2 }}
            >
              Manage Files
            </Button>
          </Paper>
        </Grid>
        
        <Grid item xs={12} md={3}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Box display="flex" alignItems="center" mb={2}>
              <BarChartIcon color="primary" sx={{ fontSize: 40, mr: 2 }} />
              <Box>
                <Typography variant="h4">{formatDuration(stats.totalPlayTime)}</Typography>
                <Typography variant="body2" color="text.secondary">Total Play Time</Typography>
              </Box>
            </Box>
            <Button
              variant="outlined"
              fullWidth
              sx={{ mt: 2 }}
              disabled
            >
              View Analytics
            </Button>
          </Paper>
        </Grid>
        
        <Grid item xs={12} md={3}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Box display="flex" alignItems="center" mb={2}>
              <Box>
                <Typography variant="h4">{formatFileSize(stats.totalSize)}</Typography>
                <Typography variant="body2" color="text.secondary">Storage Used</Typography>
              </Box>
            </Box>
            <Button
              variant="outlined"
              fullWidth
              sx={{ mt: 2 }}
              disabled
            >
              Manage Storage
            </Button>
          </Paper>
        </Grid>
      </Grid>
      
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Quick Actions
            </Typography>
            <Box display="flex" flexDirection="column" gap={2} mt={2}>
              <Button
                variant="contained"
                color="primary"
                onClick={() => navigate('/admin/files/upload')}
              >
                Upload New File
              </Button>
              <Button
                variant="outlined"
                onClick={() => navigate('/admin/users/new')}
              >
                Create New User
              </Button>
              <Button
                variant="outlined"
                onClick={() => navigate('/admin/settings')}
                disabled
              >
                System Settings
              </Button>
            </Box>
          </Paper>
        </Grid>
        
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Recent Uploads
            </Typography>
            <Box mt={2}>
              {stats.recentUploads.length > 0 ? (
                stats.recentUploads.map((file) => (
                  <Box key={file.id} sx={{ mb: 2, pb: 2, borderBottom: '1px solid #eee' }}>
                    <Typography variant="subtitle2" fontWeight="bold">
                      {file.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {file.filename} • {formatDuration(file.duration)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {format(new Date(file.createdAt), 'MMM d, yyyy')}
                    </Typography>
                  </Box>
                ))
              ) : (
                <Typography color="text.secondary" fontStyle="italic">
                  No recent uploads
                </Typography>
              )}
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
};

export default AdminDashboard;
