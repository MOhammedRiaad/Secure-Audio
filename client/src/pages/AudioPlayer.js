import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import {
  Container,
  Typography,
  Box,
  Slider,
  IconButton,
  Paper,
  Divider,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Chip,
  CircularProgress,
  Button,
  TextField,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from '@mui/material';
import {
  PlayArrow,
  Pause,
  SkipPrevious,
  SkipNext,
  Add,
  Timer,
  Edit,
  Delete,
} from '@mui/icons-material';
import { format } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';

const AudioPlayer = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  
  const [audioFile, setAudioFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [checkpoints, setCheckpoints] = useState([]);
  const [showAddCheckpoint, setShowAddCheckpoint] = useState(false);
  const [newCheckpoint, setNewCheckpoint] = useState({
    name: '',
    description: '',
    timestamp: 0,
  });
  
  const audioRef = useRef(null);
  const progressInterval = useRef(null);

  // Format time in seconds to MM:SS
  const formatTime = (timeInSeconds) => {
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Fetch audio file and checkpoints
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [fileRes, checkpointsRes] = await Promise.all([
          api.get(`/files/${id}`),
          api.get(`/checkpoints/file/${id}`)
        ]);
        
        setAudioFile(fileRes.data.data);
        setCheckpoints(checkpointsRes.data.data || []);
        setDuration(fileRes.data.data.duration);
      } catch (err) {
        setError(err.response?.data?.error?.message || err.response?.data?.message || 'Failed to load audio file');
        console.error('Error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
      }
    };
  }, [id]);

  // Initialize audio element with token-based streaming
  useEffect(() => {
    if (!audioFile) return;

    let audio = null;
    let tokenRefreshInterval = null;
    let currentToken = '';

    // Event handlers
    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const handleError = (e) => {
      console.error('Audio playback error:', e);
      setError('Error playing audio. Please try again.');
    };

    const initializeAudio = async () => {
      try {
        // Get a new stream token
        const response = await api.get(`/files/stream-token/${id}`);
        
        currentToken = response.data.data.token;
        
        // Create a new audio element
        audio = new Audio();
        audio.preload = 'none';
        audio.crossOrigin = 'anonymous';
        
        // Set up event listeners
        audio.addEventListener('loadedmetadata', handleLoadedMetadata);
        audio.addEventListener('timeupdate', handleTimeUpdate);
        audio.addEventListener('ended', handleEnded);
        audio.addEventListener('error', handleError);
        
        // Set the source with the token
        audio.src = `/api/v1/files/stream/${currentToken}`;
        
        // Set authentication headers
        const token = localStorage.getItem('token');
        if (token) {
          audio.setAttribute('crossorigin', 'use-credentials');
        }
        
        // Set up token refresh (every 4 minutes, tokens expire in 5)
        tokenRefreshInterval = setInterval(async () => {
          try {
            const refreshResponse = await api.get(`/files/stream-token/${id}`);
            currentToken = refreshResponse.data.data.token;
            
            // Only update the source if we're not currently playing to avoid interruptions
            if (audio && !isPlaying) {
              audio.src = `/api/v1/files/stream/${currentToken}`;
            }
          } catch (error) {
            console.error('Error refreshing stream token:', error);
          }
        }, 4 * 60 * 1000); // 4 minutes
        
        return audio;
      } catch (error) {
        console.error('Error initializing audio stream:', error);
        setError('Failed to initialize audio stream');
        return null;
      }
    };
    
    // Initialize the audio
    initializeAudio().then(initializedAudio => {
      if (initializedAudio) {
        audioRef.current = initializedAudio;
      }
    });
    
    // Cleanup function
    return () => {
      if (audio) {
        audio.pause();
        audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
        audio.removeEventListener('timeupdate', handleTimeUpdate);
        audio.removeEventListener('ended', handleEnded);
        audio.removeEventListener('error', handleError);
        audio.src = '';
      }
      if (tokenRefreshInterval) {
        clearInterval(tokenRefreshInterval);
      }
    };
  }, [id, audioFile, isPlaying]);

  // Handle play/pause
  const togglePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        // Add authentication token to the request headers
        const token = localStorage.getItem('token');
        if (token) {
          // Set up fetch with credentials for the audio element
          audioRef.current.setAttribute('crossorigin', 'use-credentials');
          
          // Play the audio
          const playPromise = audioRef.current.play();
          
          // Handle any play promise errors
          if (playPromise !== undefined) {
            playPromise.catch(error => {
              console.error('Playback failed:', error);
              setError('Playback failed. Please check your authentication and try again.');
              setIsPlaying(false);
            });
          } else {
            setIsPlaying(true);
          }
        } else {
          setError('Authentication required to play audio');
        }
      }
    }
  };

  // Handle seek
  const handleSeek = (event, newValue) => {
    if (!audioRef.current) return;
    
    const seekTime = (newValue / 100) * duration;
    audioRef.current.currentTime = seekTime;
    setCurrentTime(seekTime);
  };

  // Handle volume change
  const handleVolumeChange = (event, newValue) => {
    const newVolume = newValue / 100;
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
    
    // Save volume preference to localStorage
    localStorage.setItem('audioVolume', newValue);
  };

  // Jump to checkpoint
  const jumpToCheckpoint = (timestamp) => {
    if (!audioRef.current) return;
    
    audioRef.current.currentTime = timestamp;
    setCurrentTime(timestamp);
    
    if (!isPlaying) {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  // Add new checkpoint
  const handleAddCheckpoint = async () => {
    try {
      const res = await api.post('/checkpoints', {
        fileId: id,
        timestamp: Math.floor(currentTime),
        name: newCheckpoint.name,
        description: newCheckpoint.description,
      });
      
      setCheckpoints([...checkpoints, res.data.data]);
      setShowAddCheckpoint(false);
      setNewCheckpoint({ name: '', description: '', timestamp: 0 });
    } catch (err) {
      console.error('Error adding checkpoint:', err);
    }
  };

  // Delete checkpoint
  const handleDeleteCheckpoint = async (checkpointId) => {
    if (window.confirm('Are you sure you want to delete this checkpoint?')) {
      try {
        await api.delete(`/checkpoints/${checkpointId}`);
        setCheckpoints(checkpoints.filter(cp => cp.id !== checkpointId));
      } catch (err) {
        console.error('Error deleting checkpoint:', err);
      }
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <CircularProgress />
      </Box>
    );
  }

  if (error || !audioFile) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Typography color="error">{error || 'Audio file not found'}</Typography>
        <Button onClick={() => navigate(-1)} sx={{ mt: 2 }}>Go Back</Button>
      </Container>
    );
  }

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Button onClick={() => navigate(-1)} sx={{ mb: 2 }}>Back to Library</Button>
      
      <Paper elevation={3} sx={{ p: 3, mb: 3 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          {audioFile.title}
        </Typography>
        
        {audioFile.description && (
          <Typography variant="body1" color="text.secondary" paragraph>
            {audioFile.description}
          </Typography>
        )}
        
        <Box sx={{ mt: 4, mb: 2 }}>
          <Slider
            value={(currentTime / duration) * 100 || 0}
            onChange={handleSeek}
            aria-labelledby="audio-progress"
          />
          <Box display="flex" justifyContent="space-between" mt={1}>
            <Typography variant="caption">
              {formatTime(currentTime)}
            </Typography>
            <Typography variant="caption">
              {formatTime(duration)}
            </Typography>
          </Box>
        </Box>
        
        <Box display="flex" justifyContent="center" alignItems="center" gap={2} mt={2}>
          <IconButton size="large" disabled={!checkpoints.length}>
            <SkipPrevious />
          </IconButton>
          
          <IconButton
            size="large"
            color="primary"
            onClick={togglePlayPause}
            sx={{ width: 64, height: 64 }}
          >
            {isPlaying ? <Pause fontSize="large" /> : <PlayArrow fontSize="large" />}
          </IconButton>
          
          <IconButton size="large" disabled={!checkpoints.length}>
            <SkipNext />
          </IconButton>
        </Box>
        
        <Box sx={{ mt: 2 }}>
          <Box display="flex" alignItems="center" gap={1}>
            <Typography variant="body2" color="text.secondary">
              Volume:
            </Typography>
            <Slider
              value={volume * 100}
              onChange={handleVolumeChange}
              aria-labelledby="volume-slider"
              sx={{ width: 100 }}
            />
          </Box>
        </Box>
      </Paper>
      
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h6">Checkpoints</Typography>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => setShowAddCheckpoint(true)}
        >
          Add Checkpoint
        </Button>
      </Box>
      
      {checkpoints.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="text.secondary">
            No checkpoints yet. Add a checkpoint to mark important moments in the audio.
          </Typography>
        </Paper>
      ) : (
        <Paper variant="outlined">
          <List disablePadding>
            {checkpoints.map((checkpoint) => (
              <React.Fragment key={checkpoint.id}>
                <ListItem
                  secondaryAction={
                    checkpoint.userId === currentUser?.id && (
                      <Box>
                        <IconButton
                          edge="end"
                          aria-label="delete"
                          onClick={() => handleDeleteCheckpoint(checkpoint.id)}
                          size="small"
                          sx={{ mr: 1 }}
                        >
                          <Delete fontSize="small" />
                        </IconButton>
                      </Box>
                    )
                  }
                  disablePadding
                >
                  <ListItemButton
                    onClick={() => jumpToCheckpoint(checkpoint.timestamp)}
                    selected={Math.abs(currentTime - checkpoint.timestamp) < 1}
                  >
                    <ListItemIcon>
                      <Timer />
                    </ListItemIcon>
                    <ListItemText
                      primary={checkpoint.name || `Checkpoint at ${formatTime(checkpoint.timestamp)}`}
                      secondary={
                        <>
                          {formatTime(checkpoint.timestamp)}
                          {checkpoint.description && ` • ${checkpoint.description}`}
                        </>
                      }
                    />
                  </ListItemButton>
                </ListItem>
                <Divider component="li" />
              </React.Fragment>
            ))}
          </List>
        </Paper>
      )}
      
      {/* Add Checkpoint Dialog */}
      <Dialog
        open={showAddCheckpoint}
        onClose={() => setShowAddCheckpoint(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Add Checkpoint</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Name"
            fullWidth
            variant="outlined"
            value={newCheckpoint.name}
            onChange={(e) => setNewCheckpoint({ ...newCheckpoint, name: e.target.value })}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            label="Description"
            fullWidth
            multiline
            rows={3}
            variant="outlined"
            value={newCheckpoint.description}
            onChange={(e) => setNewCheckpoint({ ...newCheckpoint, description: e.target.value })}
          />
          <Box mt={2}>
            <Typography variant="body2" color="text.secondary">
              Timestamp: {formatTime(currentTime)}
            </Typography>
            <Slider
              value={(currentTime / duration) * 100 || 0}
              onChange={(e, value) => {
                const seekTime = (value / 100) * duration;
                setCurrentTime(seekTime);
                if (audioRef.current) {
                  audioRef.current.currentTime = seekTime;
                }
              }}
              aria-labelledby="checkpoint-timestamp-slider"
              sx={{ mt: 2 }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowAddCheckpoint(false)}>Cancel</Button>
          <Button
            onClick={handleAddCheckpoint}
            variant="contained"
            disabled={!newCheckpoint.name.trim()}
          >
            Add Checkpoint
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default AudioPlayer;
