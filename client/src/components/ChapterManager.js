import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  LinearProgress,
  Alert,
  Grid,
  Divider,
  Tooltip
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Pending as PendingIcon,
  Storage as StorageIcon,
  Cloud as CloudIcon,
  Speed as SpeedIcon,
  PlayArrow as PlayArrowIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import api from '../api';

const ChapterManager = ({ fileId, file, onPlayChapter }) => {
  const { user } = useAuth();
  const [chapters, setChapters] = useState([]);
  const [chapterStatus, setChapterStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [editingChapter, setEditingChapter] = useState(null);
  const [storageType, setStorageType] = useState('filesystem');

  // Form states
  const [chapterForm, setChapterForm] = useState({
    label: '',
    startTime: 0,
    endTime: null
  });

  // Load chapters and status
  useEffect(() => {
    loadChapters();
    loadChapterStatus();
  }, [fileId]);



  const loadChapters = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/files/${fileId}/chapters`);
      setChapters(response.data.data);
    } catch (err) {
      setError('Failed to load chapters');
    } finally {
      setLoading(false);
    }
  };

  const loadChapterStatus = async () => {
    try {
      const response = await api.get(`/files/${fileId}/chapters/status`);
      setChapterStatus(response.data.data);
    } catch (err) {
      console.error('Failed to load chapter status:', err);
    }
  };

  const handleAddChapter = () => {
    setEditingChapter(null);
    setChapterForm({ label: '', startTime: 0, endTime: null });
    setOpenDialog(true);
  };

  const handleEditChapter = (chapter) => {
    setEditingChapter(chapter);
    setChapterForm({
      label: chapter.label,
      startTime: chapter.startTime,
      endTime: chapter.endTime
    });
    setOpenDialog(true);
  };

  const handleSaveChapter = async () => {
    try {
      setError('');
      
      if (editingChapter) {
        // Update existing chapter
        await api.put(`/files/${fileId}/chapters/${editingChapter.id}`, chapterForm);
        setSuccess('Chapter updated successfully');
      } else {
        // Create new chapters array
        const newChapters = [...chapters, { ...chapterForm, order: chapters.length + 1 }];
        await api.post(`/files/${fileId}/chapters`, { chapters: newChapters });
        setSuccess('Chapter added successfully');
      }
      
      setOpenDialog(false);
      loadChapters();
      loadChapterStatus();
    } catch (err) {
      setError('Failed to save chapter');
    }
  };

  const handleDeleteChapter = async (chapterId) => {
    if (!window.confirm('Are you sure you want to delete this chapter?')) return;
    
    try {
      await api.delete(`/files/${fileId}/chapters/${chapterId}`);
      setSuccess('Chapter deleted successfully');
      loadChapters();
      loadChapterStatus();
    } catch (err) {
      setError('Failed to delete chapter');
    }
  };

  const handleFinalizeChapters = async () => {
    if (!window.confirm('This will process and encrypt all pending chapters. This operation cannot be undone. Continue?')) {
      return;
    }

    try {
      setFinalizing(true);
      setError('');
      
      const response = await api.post(`/files/${fileId}/chapters/finalize`, {
        storageType
      });
      
      const { finalizedChapters, errors, summary } = response.data.data;
      
      if (errors.length > 0) {
        setError(`Finalized ${summary.finalized} chapters with ${summary.failed} errors. Check console for details.`);
        console.error('Chapter finalization errors:', errors);
      } else {
        setSuccess(`Successfully finalized ${summary.finalized} chapters!`);
      }
      
      loadChapters();
      loadChapterStatus();
    } catch (err) {
      setError('Failed to finalize chapters: ' + (err.response?.data?.message || err.message));
    } finally {
      setFinalizing(false);
    }
  };

  const handleLoadSampleChapters = async () => {
    try {
      setError('');
      
      const response = await api.post(`/files/${fileId}/chapters/sample`);
      
      loadChapters();
      loadChapterStatus();
    } catch (err) {
      setError('Failed to load sample chapters');
    }
  };

  const handlePlayChapter = async (chapter) => {
    try {
      setError('');
      
      if (chapter.status !== 'ready') {
        setError('Chapter is not ready for playback. Please finalize chapters first.');
        return;
      }

      // If onPlayChapter callback is provided, use it (for integration with main player)
      if (onPlayChapter) {
        onPlayChapter(chapter);
        setSuccess(`Playing chapter: ${chapter.label}`);
        return;
      }

      // Fallback: Generate secure signed URL for chapter streaming
      const response = await api.post(`/files/${fileId}/chapters/${chapter.id}/stream-url`, {
        expiresIn: 30 * 60 * 1000 // 30 minutes
      });
      
      const { streamUrl } = response.data.data;
      
      // Create a temporary audio element to play the chapter
      const audio = new Audio();
      audio.src = streamUrl;
      audio.crossOrigin = 'use-credentials';
      
      // Add security headers and play
      audio.addEventListener('loadstart', () => {
      });
      
      audio.addEventListener('error', (e) => {
        console.error('Chapter playback error:', e);
        setError(`Failed to play chapter: ${chapter.label}`);
      });
      
      audio.play().catch(err => {
        console.error('Chapter play error:', err);
        setError(`Failed to start chapter playback: ${err.message}`);
      });
      
      setSuccess(`Playing chapter: ${chapter.label}`);
      
    } catch (err) {
      console.error('Chapter streaming error:', err);
      setError(`Failed to stream chapter: ${err.response?.data?.message || err.message}`);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'ready':
        return <CheckCircleIcon color="success" />;
      case 'failed':
        return <ErrorIcon color="error" />;
      case 'pending':
      default:
        return <PendingIcon color="warning" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'ready': return 'success';
      case 'failed': return 'error';
      case 'pending':
      default: return 'warning';
    }
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatBytes = (bytes) => {
    if (!bytes) return 'N/A';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Chapter Management
      </Typography>

      {/* Status Summary */}
      {chapterStatus && (
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle2" gutterBottom>
                  Chapter Status Summary
                </Typography>
                <Box display="flex" gap={1} flexWrap="wrap">
                  <Chip 
                    icon={<PendingIcon />}
                    label={`Pending: ${chapterStatus.summary.pending}`}
                    color="warning"
                    size="small"
                  />
                  <Chip 
                    icon={<CheckCircleIcon />}
                    label={`Ready: ${chapterStatus.summary.ready}`}
                    color="success"
                    size="small"
                  />
                  <Chip 
                    icon={<ErrorIcon />}
                    label={`Failed: ${chapterStatus.summary.failed}`}
                    color="error"
                    size="small"
                  />
                </Box>
              </Grid>
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle2" gutterBottom>
                  Chapter Finalization Controls
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  Select storage type for finalized chapter files (separate from cover image storage)
                </Typography>
                <Divider />
                <Box display="flex" gap={1} alignItems="center">
                  <FormControl size="small" sx={{ minWidth: 140 }}>
                    <InputLabel>Chapter Storage</InputLabel>
                    <Select
                      value={storageType}
                      onChange={(e) => setStorageType(e.target.value)}
                      disabled={finalizing}
                    >
                      <MenuItem value="database">
                        <Box display="flex" alignItems="center" gap={1}>
                          <CloudIcon fontSize="small" />
                          Database
                        </Box>
                      </MenuItem>
                      <MenuItem value="filesystem">
                        <Box display="flex" alignItems="center" gap={1}>
                          <StorageIcon fontSize="small" />
                          Filesystem
                        </Box>
                      </MenuItem>
                    </Select>
                  </FormControl>
                  <Button
                    variant="contained"
                    onClick={handleFinalizeChapters}
                    disabled={finalizing || chapterStatus.summary.pending === 0}
                    startIcon={finalizing ? <SpeedIcon /> : <CheckCircleIcon />}
                  >
                    {finalizing ? 'Finalizing...' : 'Finalize Chapters'}
                  </Button>
                </Box>
                <Button
                  variant="contained"
                  onClick={handleLoadSampleChapters}
                  
                  startIcon={finalizing ? <SpeedIcon /> : <CheckCircleIcon />}
                >
                  {finalizing ? 'Finalizing...' : 'Load Sample Chapters'}
                </Button>
              </Grid>
            </Grid>
            {finalizing && (
              <Box mt={2}>
                <LinearProgress />
                <Typography variant="caption" display="block" mt={1}>
                  Processing chapters... This may take several minutes for large files.
                </Typography>
              </Box>
            )}
          </CardContent>
        </Card>
      )}

      {/* Messages */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}

      {/* Chapter List */}
      <Card>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6">Chapters ({chapters.length})</Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleAddChapter}
              disabled={finalizing}
            >
              Add Chapter
            </Button>
          </Box>

          {loading ? (
            <LinearProgress />
          ) : chapters.length === 0 ? (
            <Typography color="textSecondary" align="center" py={3}>
              No chapters defined. Add chapters to enable segmented streaming.
            </Typography>
          ) : (
            <List>
              {chapters.map((chapter, index) => (
                <React.Fragment key={chapter.id}>
                  <ListItem>
                    <ListItemText
                      primary={
                        <Box display="flex" alignItems="center" gap={1}>
                          <Typography variant="subtitle1">
                            {chapter.label}
                          </Typography>
                          <Chip
                            icon={getStatusIcon(chapter.status)}
                            label={chapter.status}
                            color={getStatusColor(chapter.status)}
                            size="small"
                          />
                        </Box>
                      }
                      secondary={
                        <Box>
                          <Typography variant="body2" color="textSecondary">
                            {formatDuration(chapter.startTime)} - {chapter.endTime ? formatDuration(chapter.endTime) : 'End'}
                            {chapter.plainSize && (
                              <> • {formatBytes(chapter.plainSize)} plain • {formatBytes(chapter.encryptedSize)} encrypted</>
                            )}
                          </Typography>
                          {chapter.status === 'ready' && chapter.finalizedAt && (
                            <Typography variant="caption" color="textSecondary">
                              Finalized: {new Date(chapter.finalizedAt).toLocaleString()}
                            </Typography>
                          )}
                        </Box>
                      }
                    />
                    <ListItemSecondaryAction>
                      <Box display="flex" gap={1}>
                        {chapter.status === 'ready' && (
                          <Tooltip title="Play Chapter">
                            <IconButton
                              onClick={() => handlePlayChapter(chapter)}
                              disabled={finalizing}
                              color="primary"
                              size="small"
                            >
                              <PlayArrowIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                        <Tooltip title="Edit Chapter">
                          <IconButton
                            onClick={() => handleEditChapter(chapter)}
                            disabled={finalizing}
                            size="small"
                          >
                            <EditIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete Chapter">
                          <IconButton
                            onClick={() => handleDeleteChapter(chapter.id)}
                            disabled={finalizing}
                            color="error"
                            size="small"
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </ListItemSecondaryAction>
                  </ListItem>
                  {index < chapters.length - 1 && <Divider />}
                </React.Fragment>
              ))}
            </List>
          )}
        </CardContent>
      </Card>

      {/* Chapter Edit Dialog */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingChapter ? 'Edit Chapter' : 'Add Chapter'}
        </DialogTitle>
        <DialogContent>
          <Box display="flex" flexDirection="column" gap={2} mt={1}>
            <TextField
              label="Chapter Label"
              value={chapterForm.label}
              onChange={(e) => setChapterForm({ ...chapterForm, label: e.target.value })}
              fullWidth
              required
            />
            <TextField
              label="Start Time (seconds)"
              type="number"
              value={chapterForm.startTime}
              onChange={(e) => setChapterForm({ ...chapterForm, startTime: parseFloat(e.target.value) })}
              fullWidth
              required
            />
            <TextField
              label="End Time (seconds) - Leave empty for auto"
              type="number"
              value={chapterForm.endTime || ''}
              onChange={(e) => setChapterForm({ ...chapterForm, endTime: e.target.value ? parseFloat(e.target.value) : null })}
              fullWidth
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
          <Button onClick={handleSaveChapter} variant="contained">
            {editingChapter ? 'Update' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ChapterManager;