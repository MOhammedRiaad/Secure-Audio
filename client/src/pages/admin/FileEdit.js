import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../api';
import {
  Container,
  Typography,
  Paper,
  TextField,
  Button,
  Box,
  Alert,
  CircularProgress,
  FormControlLabel,
  Switch,
  Grid,
  Chip,
  FormControl,
  FormLabel,
  RadioGroup,
  Radio,
  Card,
  CardMedia,
  Divider,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Save as SaveIcon,
  AudioFile as AudioFileIcon,
  Image as ImageIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';

const FileEdit = () => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    isPublic: false,
    coverImage: null,
  });
  const [coverImagePreview, setCoverImagePreview] = useState(null);
  const [coverStorageType, setCoverStorageType] = useState('file');
  const [existingCoverType, setExistingCoverType] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [newChapter, setNewChapter] = useState({ label: '', startTime: '', endTime: '' });
  const fileInputRef = useRef(null);
  const [originalData, setOriginalData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  const navigate = useNavigate();
  const { id } = useParams();

  const fetchChapters = async () => {
    try {
      const res = await api.get(`/files/${id}/chapters`);
      setChapters(res.data.data || []);
    } catch (err) {
      console.error('Error fetching chapters:', err);
      // Don't show error for chapters as it's not critical
    }
  };

  useEffect(() => {
    const fetchFile = async () => {
      try {
        setLoading(true);
        const res = await api.get(`/admin/files/${id}`);
        const file = res.data.data;
        const fileData = {
          title: file.title || '',
          description: file.description || '',
          isPublic: file.isPublic || false,
          coverImage: null,
        };
        setFormData(fileData);
        setOriginalData(file);
        
        // Set existing cover image preview and determine storage type
        if (file.coverImagePath || file.coverImageBase64) {
          const coverUrl = file.coverImageBase64 
            ? file.coverImageBase64 
            : `/api/v1/cover/${file.id}`;
          setCoverImagePreview(coverUrl);
          
          // Set storage type based on existing cover
          const existingType = file.coverImageBase64 ? 'base64' : 'file';
          setExistingCoverType(existingType);
          setCoverStorageType(existingType);
        }
        
        // Fetch chapters
        await fetchChapters();
      } catch (err) {
        setError('Failed to load file data');
        console.error('Error fetching file:', err);
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchFile();
    }
  }, [id]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleCoverImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFormData(prev => ({ ...prev, coverImage: file }));
      const reader = new FileReader();
      reader.onload = (e) => {
        setCoverImagePreview(e.target.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeCoverImage = () => {
    setFormData(prev => ({ ...prev, coverImage: null }));
    setCoverImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Chapter management functions
  const handleAddChapter = async () => {
    if (!newChapter.label || !newChapter.startTime) {
      setError('Chapter label and start time are required');
      return;
    }

    try {
      const chapterData = {
        label: newChapter.label,
        startTime: parseFloat(newChapter.startTime),
        endTime: newChapter.endTime ? parseFloat(newChapter.endTime) : null
      };

      const updatedChapters = [...chapters, chapterData];
      await api.post(`/files/${id}/chapters`, { chapters: updatedChapters });
      await fetchChapters();
      setNewChapter({ label: '', startTime: '', endTime: '' });
      setSuccess('Chapter added successfully!');
    } catch (err) {
      setError('Failed to add chapter');
      console.error('Error adding chapter:', err);
    }
  };

  const handleUpdateChapter = async (chapterId, updatedData) => {
    try {
      await api.put(`/files/${id}/chapters/${chapterId}`, updatedData);
      await fetchChapters();
      setSuccess('Chapter updated successfully!');
    } catch (err) {
      setError('Failed to update chapter');
      console.error('Error updating chapter:', err);
    }
  };

  const handleDeleteChapter = async (chapterId) => {
    try {
      await api.delete(`/files/${id}/chapters/${chapterId}`);
      await fetchChapters();
      setSuccess('Chapter deleted successfully!');
    } catch (err) {
      setError('Failed to delete chapter');
      console.error('Error deleting chapter:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      setError('');
      setSuccess('');

      const submitData = new FormData();
      submitData.append('title', formData.title);
      submitData.append('description', formData.description);
      submitData.append('isPublic', formData.isPublic);
      
      if (formData.coverImage) {
        submitData.append('cover', formData.coverImage);
        submitData.append('coverStorageType', coverStorageType);
      }

      await api.put(`/admin/files/${id}`, submitData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      
      setSuccess('File updated successfully!');
      
      // Refresh file data to show updated cover image
      const refreshRes = await api.get(`/admin/files/${id}`);
      const updatedFile = refreshRes.data.data;
      setOriginalData(updatedFile);
      
      // Update cover image preview with new image
      if (updatedFile.coverImagePath || updatedFile.coverImageBase64) {
        const newCoverUrl = updatedFile.coverImageBase64 
          ? updatedFile.coverImageBase64 
          : `/api/v1/cover/${updatedFile.id}?t=${Date.now()}`;
        setCoverImagePreview(newCoverUrl);
      }
      
      // Reset form cover image state
      setFormData(prev => ({ ...prev, coverImage: null }));
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccess('');
        navigate('/admin/files');
      }, 2000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update file');
      console.error('Error updating file:', err);
    } finally {
      setSaving(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <CircularProgress />
      </Box>
    );
  }

  if (!originalData) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Alert severity="error">File not found</Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate('/admin/files')}
        sx={{ mb: 2 }}
      >
        Back to File Management
      </Button>

      <Paper sx={{ p: 4 }}>
        <Box display="flex" alignItems="center" mb={3}>
          <AudioFileIcon sx={{ mr: 2, fontSize: 32, color: 'primary.main' }} />
          <Typography variant="h4" component="h1">
            Edit File
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert severity="success" sx={{ mb: 3 }}>
            {success}
          </Alert>
        )}

        {/* File Information */}
        <Paper variant="outlined" sx={{ p: 3, mb: 4, bgcolor: 'grey.50' }}>
          <Typography variant="h6" gutterBottom>
            File Information
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <Typography variant="body2" color="text.secondary">
                Filename
              </Typography>
              <Typography variant="body1">
                {originalData.filename}
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Typography variant="body2" color="text.secondary">
                File Size
              </Typography>
              <Typography variant="body1">
                {formatFileSize(originalData.size)}
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Typography variant="body2" color="text.secondary">
                Duration
              </Typography>
              <Typography variant="body1">
                {formatDuration(originalData.duration)}
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Typography variant="body2" color="text.secondary">
                MIME Type
              </Typography>
              <Typography variant="body1">
                {originalData.mimeType}
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Typography variant="body2" color="text.secondary">
                Created At
              </Typography>
              <Typography variant="body1">
                {format(new Date(originalData.createdAt), 'PPpp')}
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Typography variant="body2" color="text.secondary">
                Current Status
              </Typography>
              <Chip
                label={originalData.isPublic ? 'Public' : 'Private'}
                color={originalData.isPublic ? 'success' : 'default'}
                size="small"
              />
            </Grid>
          </Grid>
        </Paper>

        {/* Edit Form */}
        <form onSubmit={handleSubmit}>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Title"
                name="title"
                value={formData.title}
                onChange={handleInputChange}
                required
                variant="outlined"
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Description"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                multiline
                rows={4}
                variant="outlined"
              />
            </Grid>

            <Grid item xs={12}>
              <FormControl component="fieldset" sx={{ mb: 3 }}>
                <FormLabel component="legend">Cover Image</FormLabel>
                <Box sx={{ mt: 2 }}>
                  {coverImagePreview && (
                    <Card sx={{ maxWidth: 300, mb: 2 }}>
                      <CardMedia
                        component="img"
                        height="200"
                        image={coverImagePreview}
                        alt="Cover preview"
                        sx={{ objectFit: 'cover' }}
                      />
                      <Box sx={{ p: 1, textAlign: 'center' }}>
                        <Button
                          size="small"
                          color="error"
                          onClick={removeCoverImage}
                        >
                          Remove Image
                        </Button>
                      </Box>
                    </Card>
                  )}
                  
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                    <Button
                      variant="outlined"
                      component="label"
                      startIcon={<ImageIcon />}
                    >
                      {coverImagePreview ? 'Change Image' : 'Upload Image'}
                      <input
                        ref={fileInputRef}
                        type="file"
                        hidden
                        accept="image/*"
                        onChange={handleCoverImageChange}
                      />
                    </Button>
                  </Box>
                  
                  {/* Storage Type Selection - only show if no existing cover or when uploading new image */}
                  {(!existingCoverType || formData.coverImage) && (
                    <FormControl component="fieldset" sx={{ mb: 2 }}>
                      <FormLabel component="legend">Cover Image Storage</FormLabel>
                      <RadioGroup
                        value={coverStorageType}
                        onChange={(e) => setCoverStorageType(e.target.value)}
                        row
                        sx={{ mt: 1 }}
                      >
                        <FormControlLabel
                          value="file"
                          control={<Radio />}
                          label="File Storage"
                        />
                        <FormControlLabel
                          value="base64"
                          control={<Radio />}
                          label="Database Storage"
                        />
                      </RadioGroup>
                    </FormControl>
                  )}
                  
                  <Typography variant="body2" color="text.secondary">
                    Upload a cover image for this audio file. Recommended size: 500x500px or larger.
                    {existingCoverType && !formData.coverImage && (
                      <><br />Current storage: {existingCoverType === 'base64' ? 'Database' : 'File'}</>  
                    )}
                  </Typography>
                </Box>
              </FormControl>
            </Grid>

            {/* Chapter Management Section */}
            <Grid item xs={12}>
              <Divider sx={{ my: 3 }} />
              <Typography variant="h6" gutterBottom>
                Chapter Management
              </Typography>
              
              {/* Existing Chapters */}
              {chapters.length > 0 && (
                <Box sx={{ mb: 3 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Existing Chapters ({chapters.length})
                  </Typography>
                  {chapters.map((chapter, index) => (
                    <Paper key={chapter.id} sx={{ p: 2, mb: 2 }}>
                      <Grid container spacing={2} alignItems="center">
                        <Grid item xs={12} sm={4}>
                          <TextField
                            fullWidth
                            label="Chapter Label"
                            defaultValue={chapter.label}
                            onBlur={(e) => {
                              if (e.target.value !== chapter.label) {
                                handleUpdateChapter(chapter.id, { label: e.target.value });
                              }
                            }}
                            size="small"
                          />
                        </Grid>
                        <Grid item xs={12} sm={3}>
                          <TextField
                            fullWidth
                            label="Start Time (seconds)"
                            type="number"
                            defaultValue={chapter.startTime}
                            onBlur={(e) => {
                              const newValue = parseFloat(e.target.value);
                              if (newValue !== chapter.startTime) {
                                handleUpdateChapter(chapter.id, { startTime: newValue });
                              }
                            }}
                            size="small"
                          />
                        </Grid>
                        <Grid item xs={12} sm={3}>
                          <TextField
                            fullWidth
                            label="End Time (seconds)"
                            type="number"
                            defaultValue={chapter.endTime || ''}
                            onBlur={(e) => {
                              const newValue = e.target.value ? parseFloat(e.target.value) : null;
                              if (newValue !== chapter.endTime) {
                                handleUpdateChapter(chapter.id, { endTime: newValue });
                              }
                            }}
                            size="small"
                          />
                        </Grid>
                        <Grid item xs={12} sm={2}>
                          <Button
                            color="error"
                            onClick={() => handleDeleteChapter(chapter.id)}
                            size="small"
                            fullWidth
                          >
                            Delete
                          </Button>
                        </Grid>
                      </Grid>
                    </Paper>
                  ))}
                </Box>
              )}
              
              {/* Add New Chapter */}
              <Paper sx={{ p: 2, backgroundColor: 'grey.50' }}>
                <Typography variant="subtitle2" gutterBottom>
                  Add New Chapter
                </Typography>
                <Grid container spacing={2} alignItems="center">
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      label="Chapter Label"
                      value={newChapter.label}
                      onChange={(e) => setNewChapter(prev => ({ ...prev, label: e.target.value }))}
                      size="small"
                      placeholder="e.g., Introduction"
                    />
                  </Grid>
                  <Grid item xs={12} sm={3}>
                    <TextField
                      fullWidth
                      label="Start Time (seconds)"
                      type="number"
                      value={newChapter.startTime}
                      onChange={(e) => setNewChapter(prev => ({ ...prev, startTime: e.target.value }))}
                      size="small"
                      placeholder="0"
                    />
                  </Grid>
                  <Grid item xs={12} sm={3}>
                    <TextField
                      fullWidth
                      label="End Time (seconds)"
                      type="number"
                      value={newChapter.endTime}
                      onChange={(e) => setNewChapter(prev => ({ ...prev, endTime: e.target.value }))}
                      size="small"
                      placeholder="Optional"
                    />
                  </Grid>
                  <Grid item xs={12} sm={2}>
                    <Button
                      variant="contained"
                      onClick={handleAddChapter}
                      size="small"
                      fullWidth
                      disabled={!newChapter.label || !newChapter.startTime}
                    >
                      Add
                    </Button>
                  </Grid>
                </Grid>
              </Paper>
            </Grid>

            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.isPublic}
                    onChange={handleInputChange}
                    name="isPublic"
                    color="primary"
                  />
                }
                label="Make this file public"
              />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Public files can be accessed by all users. Private files require specific access permissions.
              </Typography>
            </Grid>

            <Grid item xs={12}>
              <Box display="flex" gap={2} justifyContent="flex-end">
                <Button
                  variant="outlined"
                  onClick={() => navigate('/admin/files')}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="contained"
                  startIcon={<SaveIcon />}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </Box>
            </Grid>
          </Grid>
        </form>
      </Paper>
    </Container>
  );
};

export default FileEdit;