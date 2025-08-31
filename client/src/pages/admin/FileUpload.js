import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import ChunkedFileUpload from '../../components/ChunkedFileUpload';
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
  RadioGroup,
  Radio,
  Card,
  CardMedia,
  Switch,
} from '@mui/material';
import { CloudUpload as CloudUploadIcon, ArrowBack as ArrowBackIcon, Image as ImageIcon } from '@mui/icons-material';

const FileUpload = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const coverInputRef = useRef(null);
  
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
  // Metadata state removed as artist/album fields are not used in backend
  
  // Cover image fields
  const [coverImage, setCoverImage] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [coverStorageType, setCoverStorageType] = useState('file'); // 'file' or 'base64'
  
  // Chunked upload fields
  const [useChunkedUpload, setUseChunkedUpload] = useState(false);
  const [chunkedUploadComplete, setChunkedUploadComplete] = useState(false);
  const [chunkedUploadData, setChunkedUploadData] = useState(null);
  
  // Large file threshold (100MB)
  const LARGE_FILE_THRESHOLD = 100 * 1024 * 1024;

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
    
    // Auto-suggest chunked upload for large files
    if (selectedFile.size > LARGE_FILE_THRESHOLD) {
      setUseChunkedUpload(true);
    }
    
    // Reset upload states
    setChunkedUploadComplete(false);
    setChunkedUploadData(null);
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
      
      // Auto-suggest chunked upload for large files
      if (selectedFile.size > LARGE_FILE_THRESHOLD) {
        setUseChunkedUpload(true);
      }
      
      // Reset upload states
      setChunkedUploadComplete(false);
      setChunkedUploadData(null);
      setError('');
    }
  };

  // Handle drag over
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // Handle cover image selection
  const handleCoverImageChange = (e) => {
    const selectedFile = e.target.files[0];
    
    if (!selectedFile) return;
    
    // Validate file type
    if (!selectedFile.type.startsWith('image/')) {
      setError('Please select an image file (JPG, PNG, etc.)');
      return;
    }
    
    // Check file size (max 5MB)
    if (selectedFile.size > 5 * 1024 * 1024) {
      setError('Cover image must be less than 5MB');
      return;
    }
    
    // Set file and create preview
    setCoverImage(selectedFile);
    setCoverPreview(URL.createObjectURL(selectedFile));
    
    // Reset errors when a new file is selected
    setError('');
  };

  // Remove cover image
  const removeCoverImage = () => {
    setCoverImage(null);
    if (coverPreview) {
      URL.revokeObjectURL(coverPreview);
      setCoverPreview(null);
    }
  };

  // Handle chunked upload completion
  const handleChunkedUploadComplete = (data) => {
    setChunkedUploadComplete(true);
    setChunkedUploadData(data);
    setSuccess('File uploaded successfully using chunked upload!');
    
    // Navigate to file management after 2 seconds
    setTimeout(() => {
      navigate('/admin/files');
    }, 2000);
  };

  // Handle chunked upload error
  const handleChunkedUploadError = (error) => {
    setError(error.message || 'Chunked upload failed. Please try again.');
  };

  // Handle chunked upload progress
  const handleChunkedUploadProgress = (progressData) => {
    setUploadProgress(progressData.progress);
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
    
    // If using chunked upload, prevent regular form submission
    if (useChunkedUpload && !chunkedUploadComplete) {
      setError('Please complete the chunked upload first or disable chunked upload mode.');
      return;
    }
    
    // If chunked upload is complete, we don't need to upload again
    if (chunkedUploadComplete && chunkedUploadData) {
      setSuccess('File already uploaded successfully!');
      setTimeout(() => {
        navigate('/admin/files');
      }, 1000);
      return;
    }
    
    try {
      setUploading(true);
      setError('');
      setSuccess('');
      
      // Create form data
      const formData = new FormData();
      formData.append('audio', file); // Changed from 'file' to 'audio'
      formData.append('title', title);
      formData.append('description', description);
      formData.append('isPublic', isPublic);
      
      // Add cover image if selected
      if (coverImage) {
        formData.append('cover', coverImage);
        formData.append('coverStorageType', coverStorageType);
      }
      
      // Artist and album metadata removed as not used in backend
      
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
      setCoverImage(null);
      if (coverPreview) {
        URL.revokeObjectURL(coverPreview);
        setCoverPreview(null);
      }
      setTitle('');
      setDescription('');
      setIsPublic(false);
      setCoverStorageType('file');
      // Metadata reset removed as fields are not used
      
      // Navigate to file management after 2 seconds
      setTimeout(() => {
        navigate('/admin/files');
      }, 2000);
      
    } catch (err) {
      console.error('Error uploading file:', err);
      setError(
        err.response?.data?.error?.message || err.response?.data?.message || 'Failed to upload file. Please try again.'
      );
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // Clean up preview URLs when component unmounts
  useEffect(() => {
    return () => {
      if (preview) {
        URL.revokeObjectURL(preview);
      }
      if (coverPreview) {
        URL.revokeObjectURL(coverPreview);
      }
    };
  }, [preview, coverPreview]);

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
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
              Maximum file size: 2GB
            </Typography>
          </Box>
        )}
      </Paper>
      
      {file && (
        <>
          {/* Chunked Upload Option */}
          <Paper sx={{ p: 3, mb: 3 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Box>
                <Typography variant="h6" gutterBottom>
                  Upload Method
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {file.size > LARGE_FILE_THRESHOLD 
                    ? `Large file detected (${formatFileSize(file.size)}). Chunked upload is recommended for better reliability.`
                    : 'Choose between regular upload or chunked upload for better reliability.'
                  }
                </Typography>
              </Box>
              <FormControlLabel
                control={
                  <Switch
                    checked={useChunkedUpload}
                    onChange={(e) => {
                      setUseChunkedUpload(e.target.checked);
                      setChunkedUploadComplete(false);
                      setChunkedUploadData(null);
                    }}
                    disabled={uploading || chunkedUploadComplete}
                  />
                }
                label="Use Chunked Upload"
              />
            </Box>
            
            {useChunkedUpload && (
              <ChunkedFileUpload
                file={file}
                onUploadComplete={handleChunkedUploadComplete}
                onUploadError={handleChunkedUploadError}
                onUploadProgress={handleChunkedUploadProgress}
                metadata={{
                  title,
                  description,
                  isPublic
                }}
                formData={{
                  title,
                  description,
                  isPublic,
                  coverStorageType,
                  ...(coverImage && { cover: coverImage })
                }}
                disabled={uploading}
              />
            )}
          </Paper>
          
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
                
                <Divider sx={{ my: 3 }} />
                
                {/* Cover Image Section */}
                <Typography variant="subtitle2" gutterBottom>
                  Cover Image (Optional)
                </Typography>
                
                {coverPreview ? (
                  <Card sx={{ maxWidth: 200, mb: 2 }}>
                    <CardMedia
                      component="img"
                      height="200"
                      image={coverPreview}
                      alt="Cover preview"
                    />
                    <Box p={1}>
                      <Button
                        size="small"
                        color="error"
                        onClick={removeCoverImage}
                        fullWidth
                      >
                        Remove
                      </Button>
                    </Box>
                  </Card>
                ) : (
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 2,
                      textAlign: 'center',
                      cursor: 'pointer',
                      mb: 2,
                      '&:hover': {
                        backgroundColor: 'action.hover',
                      },
                    }}
                    onClick={() => coverInputRef.current.click()}
                  >
                    <ImageIcon sx={{ fontSize: 40, color: 'text.secondary', mb: 1 }} />
                    <Typography variant="body2" color="text.secondary">
                      Click to select cover image
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Supported formats: JPG, PNG, GIF, WebP
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Maximum file size: 5MB
                    </Typography>
                  </Paper>
                )}
                
                <input
                  type="file"
                  ref={coverInputRef}
                  onChange={handleCoverImageChange}
                  accept="image/*"
                  style={{ display: 'none' }}
                />
                
                {/* Storage Type Selection */}
                <FormControl component="fieldset" sx={{ mt: 2 }}>
                  <FormLabel component="legend">Cover Image Storage</FormLabel>
                  <RadioGroup
                    value={coverStorageType}
                    onChange={(e) => setCoverStorageType(e.target.value)}
                    row
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
              </Grid>
              
              <Grid item xs={12} md={6}>
                {/* Additional metadata section removed as artist/album fields are not used in backend */}
              </Grid>
            </Grid>
            
            <Box mt={4}>
              <Button
                type="submit"
                variant="contained"
                color="primary"
                size="large"
                startIcon={uploading ? <CircularProgress size={24} /> : <CloudUploadIcon />}
                disabled={uploading || (useChunkedUpload && !chunkedUploadComplete)}
                fullWidth
              >
                {uploading 
                  ? 'Uploading...' 
                  : useChunkedUpload 
                    ? (chunkedUploadComplete ? 'Complete Upload' : 'Complete Chunked Upload First')
                    : 'Upload File'
                }
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
        </>
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
