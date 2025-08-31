import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api';
import {
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
  CardMedia,
  CardActionArea,
  Box,
  CircularProgress,
  TextField,
  InputAdornment,
  IconButton,
  Button,
  Chip,
} from '@mui/material';
import { Search, MusicNote, Security, Person, Logout } from '@mui/icons-material';
import DeviceWarnings from '../components/DeviceWarnings';

const Dashboard = () => {
  const [audioFiles, setAudioFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const { isAuthenticated, isAdmin, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchAudioFiles = async () => {
      try {
        setLoading(true);
        console.log('Fetching audio files...');
        const res = await api.get('/files');
        console.log('Audio files response:', res.data);
        setAudioFiles(res.data.data || []);
      } catch (err) {
        setError(err.response?.data?.error?.message || err.response?.data?.message || 'Failed to fetch audio files');
        console.error('Error fetching audio files:', err);
        console.error('Error details:', err.response?.data || err.message);
      } finally {
        setLoading(false);
      }
    };

    if (isAuthenticated) {
      fetchAudioFiles();
    }
  }, [isAuthenticated]);

  const handleSearch = (e) => {
    setSearchTerm(e.target.value.toLowerCase());
  };

  const filteredFiles = audioFiles.filter(
    (file) =>
      file.title.toLowerCase().includes(searchTerm) ||
      file.description?.toLowerCase().includes(searchTerm) 
  );



  const formatDuration = (seconds) => {
    if (!seconds) return '0:00';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${remainingSeconds}s`;
    }
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
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
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
        <Typography variant="h4" component="h1">
          My Audio Library
        </Typography>
        <Box display="flex" gap={2}>
          <Button
            variant="outlined"
            startIcon={<Person />}
            onClick={() => navigate('/profile')}
          >
            Profile
          </Button>
          <Button
            variant="outlined"
            startIcon={<Security />}
            onClick={() => navigate('/devices')}
          >
            Device Security
          </Button>
          {isAdmin && (
            <Button
              variant="contained"
              color="primary"
              onClick={() => navigate('/admin/files/new')}
            >
              Upload New File
            </Button>
          )}
          <Button
            variant="outlined"
            color="error"
            startIcon={<Logout />}
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
          >
            Logout
          </Button>
        </Box>
      </Box>

      {/* Device Warnings */}
      <DeviceWarnings />

      <TextField
        fullWidth
        variant="outlined"
        placeholder="Search audio files..."
        value={searchTerm}
        onChange={handleSearch}
        sx={{ mb: 3 }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <Search />
            </InputAdornment>
          ),
        }}
      />

      {error && (
        <Box mb={3}>
          <Typography color="error">{error}</Typography>
        </Box>
      )}

      {filteredFiles.length === 0 ? (
        <Box textAlign="center" py={4}>
          <MusicNote sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">
            {searchTerm ? 'No matching audio files found' : 'No audio files available'}
          </Typography>
        </Box>
      ) : (
        <Grid container spacing={3}>
          {filteredFiles.map((file) => (
            <Grid item key={file.id} xs={12} sm={6} md={4}>
              <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <CardActionArea
                  onClick={() => navigate(`/player/${file.id}`)}
                  sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}
                >
                  <Box sx={{ position: 'relative', pt: '56.25%' }}>
                    {file.coverImagePath || file.coverImageBase64 ? (
                      <CardMedia
                        component="img"
                        sx={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                        }}
                        image={
                          file.coverImageBase64
                            ? file.coverImageBase64
                            : `/api/v1/files/cover/${file.id}`
                        }
                        alt={`${file.title} cover`}
                      />
                    ) : (
                      <Box
                        sx={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          bgcolor: 'background.paper',
                        }}
                      >
                        <MusicNote sx={{ fontSize: 60, color: 'text.secondary' }} />
                      </Box>
                    )}
                  </Box>
                  <CardContent sx={{ flexGrow: 1 }}>
                    <Typography gutterBottom variant="h6" component="h2" noWrap>
                      {file.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" noWrap>
                      {file.description || 'No description'}
                    </Typography>
                    <Box display="flex" justifyContent="space-between" mt={2}>
                      <Chip
                        label={formatDuration(file.duration)}
                        size="small"
                        variant="outlined"
                      />
                      {file.isPublic && (
                        <Chip
                          label="Public"
                          size="small"
                          color="primary"
                          variant="outlined"
                        />
                      )}
                    </Box>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </Container>
  );
};

export default Dashboard;
