import React, { useState, useRef, useCallback } from 'react';
import {
  Box,
  Button,
  LinearProgress,
  Typography,
  Alert,
  CircularProgress,
  Paper,
  IconButton,
} from '@mui/material';
import {
  CloudUpload as CloudUploadIcon,
  Pause as PauseIcon,
  PlayArrow as PlayArrowIcon,
  Stop as StopIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import api from '../api';

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

const ChunkedFileUpload = ({ 
  file, 
  onUploadComplete, 
  onUploadError, 
  onUploadProgress,
  metadata = {},
  disabled = false,
  formData = {} // Additional form data for finalization
}) => {
  const [uploadState, setUploadState] = useState('idle'); // idle, uploading, paused, completed, error
  const [progress, setProgress] = useState(0);
  const [uploadedChunks, setUploadedChunks] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  const [uploadId, setUploadId] = useState(null);
  const [error, setError] = useState('');
  const [isPaused, setIsPaused] = useState(false);
  const [currentChunk, setCurrentChunk] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const [uploadSpeed, setUploadSpeed] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(0);
  
  const abortControllerRef = useRef(null);
  const startTimeRef = useRef(null);
  const uploadedBytesRef = useRef(0);

  // Calculate file hash for integrity verification (using SHA-256 to match backend)
  const calculateFileHash = useCallback(async (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const arrayBuffer = e.target.result;
        // Use SHA-256 to match backend verification
        const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        resolve(hashHex);
      };
      reader.readAsArrayBuffer(file);
    });
  }, []);

  // Initialize upload session
  const initializeUpload = useCallback(async () => {
    try {
      console.log('ChunkedFileUpload: Starting upload initialization...');
      const fileHash = await calculateFileHash(file);
      const chunks = Math.ceil(file.size / CHUNK_SIZE);
      
      console.log('ChunkedFileUpload: Sending initialization request...');
      const response = await api.post('/audio/upload/init', {
        fileName: file.name,
        fileSize: file.size,
        totalChunks: chunks,
        fileHash,
        mimeType: file.type,
        ...metadata
      });
      
      console.log('ChunkedFileUpload: Initialization response:', response.data);
      const newUploadId = response.data?.data?.uploadId;
      if (!newUploadId) {
        throw new Error('Invalid response: uploadId not received');
      }
      
      setUploadId(newUploadId);
      setTotalChunks(chunks);
      console.log('ChunkedFileUpload: Upload initialized successfully with ID:', newUploadId);
      return newUploadId;
    } catch (error) {
      console.error('ChunkedFileUpload: Initialization failed:', error);
      throw new Error(`Failed to initialize upload: ${error.response?.data?.message || error.message}`);
    }
  }, [file, metadata, calculateFileHash]);

  // Upload a single chunk
  const uploadChunk = useCallback(async (uploadId, chunkIndex, chunk, retries = 0) => {
    try {
      const formData = new FormData();
      formData.append('chunk', chunk);
      
      // Create a new abort controller for this specific chunk
      const chunkAbortController = new AbortController();
      abortControllerRef.current = chunkAbortController;
      
      const response = await api.post('/audio/upload/chunk', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'X-Upload-Id': uploadId,
          'X-Chunk-Index': chunkIndex,
          'X-Total-Chunks': totalChunks,
          'X-File-Name': file.name,
          'X-File-Size': file.size,
        },
        signal: chunkAbortController.signal,
        timeout: 60000, // 60 second timeout per chunk
      });
      
      return response.data;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw error;
      }
      
      if (retries < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (retries + 1)));
        return uploadChunk(uploadId, chunkIndex, chunk, retries + 1);
      }
      
      throw new Error(`Failed to upload chunk ${chunkIndex}: ${error.response?.data?.message || error.message}`);
    }
  }, [totalChunks, file]);

  // Update progress and speed calculations
  const updateProgress = useCallback((chunkIndex, chunkSize) => {
    const uploaded = chunkIndex + 1;
    const progressPercent = Math.round((uploaded / totalChunks) * 100);
    
    uploadedBytesRef.current += chunkSize;
    const elapsed = (Date.now() - startTimeRef.current) / 1000;
    const speed = uploadedBytesRef.current / elapsed; // bytes per second
    const remaining = (file.size - uploadedBytesRef.current) / speed;
    
    setProgress(progressPercent);
    setUploadedChunks(uploaded);
    setCurrentChunk(chunkIndex + 1);
    setUploadSpeed(speed);
    setTimeRemaining(remaining);
    
    if (onUploadProgress) {
      onUploadProgress({
        progress: progressPercent,
        uploadedChunks: uploaded,
        totalChunks,
        uploadedBytes: uploadedBytesRef.current,
        totalBytes: file.size,
        speed,
        timeRemaining: remaining
      });
    }
  }, [totalChunks, file.size, onUploadProgress]);

  // Main upload function
  const startUpload = useCallback(async () => {
    try {
      setUploadState('uploading');
      setError('');
      setRetryCount(0);
      startTimeRef.current = Date.now();
      uploadedBytesRef.current = 0;
      
      let currentUploadId = uploadId;
      if (!currentUploadId) {
        currentUploadId = await initializeUpload();
        // Add a delay to ensure backend has time to save upload session
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      
      // Validate uploadId before making status request
      if (!currentUploadId) {
        throw new Error('Failed to initialize upload session');
      }
      
      // Check if upload can be resumed
      console.log('ChunkedFileUpload: Checking upload status for ID:', currentUploadId);
      const statusResponse = await api.get(`/audio/upload/status/${currentUploadId}`);
      console.log('ChunkedFileUpload: Status response:', statusResponse.data);
      const { uploadedChunks: resumeFromChunk = 0 } = statusResponse.data;
      
      setUploadedChunks(resumeFromChunk);
      setCurrentChunk(resumeFromChunk);
      
      // Upload remaining chunks
      for (let i = resumeFromChunk; i < totalChunks; i++) {
        if (isPaused) {
          setUploadState('paused');
          return;
        }
        
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);
        
        await uploadChunk(currentUploadId, i, chunk);
        updateProgress(i, chunk.size);
      }
      
      // Add delay before finalization to ensure all chunks are written to disk
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Finalize upload with form data
      const finalizeFormData = new FormData();
      
      // Add form fields
      Object.keys(formData).forEach(key => {
        if (formData[key] !== null && formData[key] !== undefined) {
          // Handle File objects (like cover images) properly
          if (formData[key] instanceof File) {
            finalizeFormData.append(key, formData[key]);
          } else {
            // Handle regular form data
            finalizeFormData.append(key, formData[key]);
          }
        }
      });
      
      const finalizeResponse = await api.post(`/audio/upload/finalize/${currentUploadId}`, finalizeFormData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        timeout: 300000 // 5 minute timeout for finalization
      });
      
      setUploadState('completed');
      setProgress(100);
      
      if (onUploadComplete) {
        onUploadComplete(finalizeResponse.data);
      }
      
    } catch (error) {
      if (error.name === 'AbortError') {
        setUploadState('paused');
        return;
      }
      
      setUploadState('error');
      setError(error.message);
      
      if (onUploadError) {
        onUploadError(error);
      }
    }
  }, [uploadId, initializeUpload, totalChunks, isPaused, file, uploadChunk, updateProgress, onUploadComplete, onUploadError]);

  // Pause upload
  const pauseUpload = useCallback(() => {
    setIsPaused(true);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  // Resume upload
  const resumeUpload = useCallback(() => {
    setIsPaused(false);
    startUpload();
  }, [startUpload]);

  // Cancel upload
  const cancelUpload = useCallback(async () => {
    try {
      setIsPaused(true);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      
      if (uploadId) {
        await api.delete(`/audio/upload/cancel/${uploadId}`);
      }
      
      // Reset state
      setUploadState('idle');
      setProgress(0);
      setUploadedChunks(0);
      setCurrentChunk(0);
      setUploadId(null);
      setError('');
      uploadedBytesRef.current = 0;
    } catch (error) {
      console.error('Error canceling upload:', error);
    }
  }, [uploadId]);

  // Retry upload
  const retryUpload = useCallback(() => {
    setRetryCount(prev => prev + 1);
    setError('');
    startUpload();
  }, [startUpload]);

  // Format file size
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Format time
  const formatTime = (seconds) => {
    if (!seconds || !isFinite(seconds)) return '--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!file) {
    return null;
  }

  return (
    <Paper sx={{ p: 3, mt: 2 }}>
      <Typography variant="h6" gutterBottom>
        Chunked Upload: {file.name.split('.')[0]}
      </Typography>
      
      <Typography variant="body2" color="text.secondary" gutterBottom>
        File size: {formatFileSize(file.size)} | Chunk size: {formatFileSize(CHUNK_SIZE)}
      </Typography>
      
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
          <Button size="small" onClick={retryUpload} sx={{ ml: 1 }}>
            Retry
          </Button>
        </Alert>
      )}
      
      {uploadState !== 'idle' && (
        <Box sx={{ mb: 2 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
            <Typography variant="body2">
              Progress: {uploadedChunks}/{totalChunks} chunks ({progress}%)
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {uploadSpeed > 0 && `${formatFileSize(uploadSpeed)}/s`}
              {timeRemaining > 0 && ` • ${formatTime(timeRemaining)} remaining`}
            </Typography>
          </Box>
          
          <LinearProgress 
            variant="determinate" 
            value={progress} 
            sx={{ height: 8, borderRadius: 4 }}
          />
          
          <Typography variant="caption" color="text.secondary" display="block" mt={1}>
            {formatFileSize(uploadedBytesRef.current)} / {formatFileSize(file.size)} uploaded
          </Typography>
        </Box>
      )}
      
      <Box display="flex" gap={1} alignItems="center">
        {uploadState === 'idle' && (
          <Button
            variant="contained"
            startIcon={<CloudUploadIcon />}
            onClick={startUpload}
            disabled={disabled}
          >
            Start Chunked Upload
          </Button>
        )}
        
        {uploadState === 'uploading' && (
          <>
            <Button
              variant="outlined"
              startIcon={<PauseIcon />}
              onClick={pauseUpload}
            >
              Pause
            </Button>
            <Button
              variant="outlined"
              color="error"
              startIcon={<StopIcon />}
              onClick={cancelUpload}
            >
              Cancel
            </Button>
          </>
        )}
        
        {uploadState === 'paused' && (
          <>
            <Button
              variant="contained"
              startIcon={<PlayArrowIcon />}
              onClick={resumeUpload}
            >
              Resume
            </Button>
            <Button
              variant="outlined"
              color="error"
              startIcon={<StopIcon />}
              onClick={cancelUpload}
            >
              Cancel
            </Button>
          </>
        )}
        
        {uploadState === 'error' && (
          <>
            <Button
              variant="contained"
              startIcon={<RefreshIcon />}
              onClick={retryUpload}
            >
              Retry Upload
            </Button>
            <Button
              variant="outlined"
              color="error"
              startIcon={<StopIcon />}
              onClick={cancelUpload}
            >
              Cancel
            </Button>
          </>
        )}
        
        {uploadState === 'completed' && (
          <Alert severity="success">
            Upload completed successfully!
          </Alert>
        )}
        
        {uploadState === 'uploading' && (
          <CircularProgress size={24} />
        )}
      </Box>
    </Paper>
  );
};

export default ChunkedFileUpload;