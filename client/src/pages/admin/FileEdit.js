import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../api';
import ChapterManager from '../../components/ChapterManager';
import DRMPlayer from '../../components/DRMPlayer';
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
  const fileInputRef = useRef(null);
  const [originalData, setOriginalData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const drmPlayerRef = useRef(null);
  
  const navigate = useNavigate();
  const { id } = useParams();

  // Handle chapter playback through DRMPlayer
  const handlePlayChapter = (chapter) => {
    if (drmPlayerRef.current) {
      drmPlayerRef.current.playChapter(chapter);
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
                  
                  {/* Cover Image Storage Type Selection - only show if no existing cover or when uploading new image */}
                  {(!existingCoverType || formData.coverImage) && (
                    <FormControl component="fieldset" sx={{ mb: 2 }}>
                      <FormLabel component="legend">Cover Image Storage Type</FormLabel>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                        Choose how to store the cover image (separate from chapter storage settings below)
                      </Typography>
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

            {/* Audio Player Section */}
            <Grid item xs={12}>
              <Divider sx={{ my: 3 }} />
              <Typography variant="h6" gutterBottom>
                Audio Player
              </Typography>
              <DRMPlayer 
                ref={drmPlayerRef}
                fileId={id} 
                onError={(error) => setError(error)}
              />
            </Grid>

            {/* Chapter Management Section */}
            <Grid item xs={12}>
              <Divider sx={{ my: 3 }} />
              <ChapterManager 
                fileId={id} 
                file={originalData} 
                onPlayChapter={handlePlayChapter}
              />
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