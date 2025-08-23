import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import DRMPlayer from '../components/DRMPlayer';
import {
  Container,
  Typography,
  Box,
  Paper,
  Divider,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  CircularProgress,
  Button,
  TextField,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
} from '@mui/material';
import {
  Add,
  Timer,
  Delete,
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';

const AudioPlayer = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  
  const [audioFile, setAudioFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [checkpoints, setCheckpoints] = useState([]);
  const [showAddCheckpoint, setShowAddCheckpoint] = useState(false);
  const [newCheckpoint, setNewCheckpoint] = useState({
    name: '',
    description: '',
    timestamp: 0,
  });
  const [drmEnabled, setDrmEnabled] = useState(true);
  
  // Refs no longer needed - DRM player handles audio internally

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
        // Duration is now handled by DRM player
      } catch (err) {
        setError(err.response?.data?.error?.message || err.response?.data?.message || 'Failed to load audio file');
        console.error('Error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    return () => {
      // Cleanup is now handled by DRM player
    };
  }, [id]);

  // Audio initialization handled by DRM player

  // Handle DRM toggle (for admin users)
  const toggleDRM = () => {
    setDrmEnabled(!drmEnabled);
  };

  // Jump to checkpoint
  const jumpToCheckpoint = (timestamp) => {
    // Checkpoint jumping is now handled by DRM player
    console.log('Jumping to checkpoint:', timestamp);
  };

  // Add new checkpoint
  const handleAddCheckpoint = async () => {
    try {
      const res = await api.post('/checkpoints', {
        fileId: id,
        timestamp: Math.floor(0), // Will be updated when DRM player provides current time
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
        
        {/* DRM Audio Player */}
        <DRMPlayer 
          audioFile={audioFile}
          drmEnabled={drmEnabled}
          onTimeUpdate={(time) => {/* Time updates handled by DRM player */}}
          onCheckpointJump={jumpToCheckpoint}
          checkpoints={checkpoints}
        />
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
                    selected={false} // Selection state will be handled by DRM player
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
              Timestamp: {formatTime(0)}
            </Typography>
            {/* Timestamp selection will be handled by DRM player */}
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
