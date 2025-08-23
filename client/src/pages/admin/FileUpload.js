import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import {
  Container,
  Typography,
  Paper,
  Box,
  Button,
  TextField,
  CircularProgress,
  Alert,
  FormControl,
  FormLabel,
  FormGroup,
  FormControlLabel,
  Checkbox,
  LinearProgress,
  Divider,
  Grid,
} from '@mui/material';
import { CloudUpload as CloudUploadIcon, ArrowBack as ArrowBackIcon } from '@mui/icons-material';

const FileUpload = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Form fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [metadata, setMetadata] = useState({
    artist: '',
    album: '',
    genre: '',
    year: '',
  });

  // Handle file selection
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    
    if (!selectedFile) return;
    
    // Validate file type
    if (!selectedFile.type.startsWith('audio/')) {
      setError('Please select an audio file (MP3, WAV, etc.)');
      return;
    }
    
    // Set file and create preview
    setFile(selectedFile);
    setPreview(URL.createObjectURL(selectedFile));
    
    // Set title from filename if not already set
    if (!title) {
      const fileName = selectedFile.name.replace(/\.[^/.]+$/, '');
      setTitle(fileName);
    }
    
    // Reset errors when a new file is selected
    setError('');
  };

  // Handle drag and drop
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const selectedFile = e.dataTransfer.files[0];
      
      // Validate file type
      if (!selectedFile.type.startsWith('audio/')) {
        setError('Please select an audio file (MP3, WAV, etc.)');
        return;
      }
      
      setFile(selectedFile);
      setPreview(URL.createObjectURL(selectedFile));
      
      // Set title from filename if not already set
      if (!title) {
        const fileName = selectedFile.name.replace(/\.[^/.]+$/, '');
        setTitle(fileName);
      }
      
      // Reset errors when a new file is selected
      setError('');
    }
  };

  // Handle drag over
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!file) {
      setError('Please select a file to upload');
      return;
    }
    
    if (!title.trim()) {
      setError('Please enter a title for the audio file');
      return;
    }
    
    try {
      setUploading(true);
      setError('');
      setSuccess('');
      
      // Create form data
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', title);
      formData.append('description', description);
      formData.append('isPublic', isPublic);
      
      // Add metadata if available
      if (metadata.artist) formData.append('artist', metadata.artist);
      if (metadata.album) formData.append('album', metadata.album);
      if (metadata.genre) formData.append('genre', metadata.genre);
      if (metadata.year) formData.append('year', metadata.year);
      
      // Upload file with progress tracking
      const response = await api.post('/files', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          const progress = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          setUploadProgress(progress);
        },
      });
      
      // Handle successful upload
      setSuccess('File uploaded successfully!');
      setUploading(false);
      setUploadProgress(0);
      
      // Reset form after successful upload
      setFile(null);
      setPreview(null);
      setTitle('');
      setDescription('');
      setIsPublic(false);
      setMetadata({
        artist: '',
        album: '',
        genre: '',
        year: '',
      });
      
      // Navigate to file management after 2 seconds
      setTimeout(() => {
        navigate('/admin/files');
      }, 2000);
      
    } catch (err) {
      console.error('Error uploading file:', err);
      setError(
        err.response?.data?.error || 'Failed to upload file. Please try again.'
      );
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // Clean up preview URL when component unmounts
  useEffect(() => {
    return () => {
      if (preview) {
        URL.revokeObjectURL(preview);
      }
    };
  }, [preview]);

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate(-1)}
        sx={{ mb: 2 }}
      >
        Back
      </Button>
      
      <Typography variant="h4" component="h1" gutterBottom>
        Upload Audio File
      </Typography>
      
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
      
      <Paper
        variant="outlined"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        sx={{
          p: 4,
          textAlign: 'center',
          border: '2px dashed',
          borderColor: 'divider',
          mb: 4,
          cursor: 'pointer',
          '&:hover': {
            borderColor: 'primary.main',
            backgroundColor: 'action.hover',
          },
        }}
        onClick={() => fileInputRef.current.click()}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="audio/*"
          style={{ display: 'none' }}
        />
        
        {file ? (
          <Box>
            <Typography variant="h6" gutterBottom>
              {file.name}
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {formatFileSize(file.size)}
            </Typography>
            {preview && (
              <Box mt={2}>
                <audio
                  controls
                  src={preview}
                  style={{ width: '100%', marginTop: '16px' }}
                />
              </Box>
            )}
            <Button
              variant="outlined"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current.click();
              }}
              sx={{ mt: 2 }}
            >
              Change File
            </Button>
          </Box>
        ) : (
          <Box>
            <CloudUploadIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              Drag & drop an audio file here, or click to select
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Supported formats: MP3, WAV, AAC, OGG, etc.
            </Typography>
          </Box>
        )}
      </Paper>
      
      {file && (
        <Paper sx={{ p: 4, mb: 4 }}>
          <Typography variant="h6" gutterBottom>
            File Details
          </Typography>
          
          <form onSubmit={handleSubmit}>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  margin="normal"
                />
                
                <TextField
                  fullWidth
                  label="Description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  multiline
                  rows={4}
                  margin="normal"
                />
                
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={isPublic}
                      onChange={(e) => setIsPublic(e.target.checked)}
                      color="primary"
                    />
                  }
                  label="Make this file public"
                  sx={{ mt: 2, display: 'block' }}
                />
              </Grid>
              
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle2" gutterBottom>
                  Additional Metadata (Optional)
                </Typography>
                
                <TextField
                  fullWidth
                  label="Artist"
                  value={metadata.artist}
                  onChange={(e) => setMetadata({ ...metadata, artist: e.target.value })}
                  margin="dense"
                />
                
                <TextField
                  fullWidth
                  label="Album"
                  value={metadata.album}
                  onChange={(e) => setMetadata({ ...metadata, album: e.target.value })}
                  margin="dense"
                />
                
                <Box display="flex" gap={2}>
                  <TextField
                    fullWidth
                    label="Genre"
                    value={metadata.genre}
                    onChange={(e) => setMetadata({ ...metadata, genre: e.target.value })}
                    margin="dense"
                  />
                  
                  <TextField
                    fullWidth
                    label="Year"
                    value={metadata.year}
                    onChange={(e) => setMetadata({ ...metadata, year: e.target.value })}
                    margin="dense"
                    type="number"
                    inputProps={{ min: '1900', max: '2099', step: '1' }}
                  />
                </Box>
              </Grid>
            </Grid>
            
            <Box mt={4}>
              <Button
                type="submit"
                variant="contained"
                color="primary"
                size="large"
                startIcon={uploading ? <CircularProgress size={24} /> : <CloudUploadIcon />}
                disabled={uploading}
                fullWidth
              >
                {uploading ? 'Uploading...' : 'Upload File'}
              </Button>
              
              {uploading && uploadProgress > 0 && (
                <Box mt={2}>
                  <LinearProgress 
                    variant="determinate" 
                    value={uploadProgress} 
                    sx={{ height: 8, borderRadius: 4 }}
                  />
                  <Typography variant="caption" color="text.secondary" display="block" textAlign="center" mt={1}>
                    {uploadProgress}% uploaded
                  </Typography>
                </Box>
              )}
            </Box>
          </form>
        </Paper>
      )}
    </Container>
  );
};

// Helper function to format file size
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export default FileUpload;
