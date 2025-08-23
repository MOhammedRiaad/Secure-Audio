import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../../api';
import {
  Container,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  TextField,
  Box,
  CircularProgress,
  Alert,
  Chip,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  CloudUpload as CloudUploadIcon,
  Visibility as VisibilityIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  AudioFile as AudioFileIcon,
  ManageAccounts as ManageAccountsIcon,
  ArrowBack as ArrowBackIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';

const FileManagement = () => {
  const [audioFiles, setAudioFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  
  const navigate = useNavigate();

  useEffect(() => {
    const fetchAudioFiles = async () => {
      try {
        setLoading(true);
        const res = await api.get('/admin/files');
        setAudioFiles(res.data.data || []);
      } catch (err) {
        setError(err.response?.data?.error?.message || err.response?.data?.message || 'Failed to load audio files');
        console.error('Error fetching audio files:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAudioFiles();
  }, []);

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleSearch = (e) => {
    setSearchTerm(e.target.value.toLowerCase());
    setPage(0);
  };

  const handleStatusFilterChange = (event) => {
    setStatusFilter(event.target.value);
    setPage(0);
  };

  const filteredFiles = audioFiles.filter((file) => {
    const matchesSearch = 
      file.title?.toLowerCase().includes(searchTerm) ||
      file.filename?.toLowerCase().includes(searchTerm) ||
      file.description?.toLowerCase().includes(searchTerm);
    
    const matchesStatus = 
      statusFilter === 'all' || 
      (statusFilter === 'public' && file.isPublic) ||
      (statusFilter === 'private' && !file.isPublic);
    
    return matchesSearch && matchesStatus;
  });

  const handleDeleteClick = (file) => {
    setFileToDelete(file);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    try {
      setDeleteLoading(true);
      setDeleteError('');
      
      await api.delete(`/admin/files/${fileToDelete.id}`);
      
      // Remove the file from the state
      setAudioFiles(audioFiles.filter(file => file.id !== fileToDelete.id));
      
      setSuccessMessage('File deleted successfully');
      setDeleteDialogOpen(false);
      setFileToDelete(null);
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      console.error('Error deleting file:', err);
      setDeleteError(err.response?.data?.message || 'Failed to delete file');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    await handleDelete();
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setFileToDelete(null);
    setDeleteError('');
  };

  const handleEditFile = (fileId) => {
    navigate(`/admin/files/edit/${fileId}`);
  };

  const handleUploadFile = () => {
    navigate('/admin/files/upload');
  };

  const handleViewFile = (fileId) => {
    navigate(`/player/${fileId}`);
  };

  const handleManageAccess = (fileId) => {
    navigate(`/admin/files/${fileId}/access`);
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate('/admin')}
        sx={{ mb: 2 }}
      >
        Back to Admin Dashboard
      </Button>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
        <Typography variant="h4" component="h1">
          File Management
        </Typography>
        <Button
          variant="contained"
          color="primary"
          startIcon={<CloudUploadIcon />}
          onClick={handleUploadFile}
        >
          Upload File
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {successMessage && (
        <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccessMessage('')}>
          {successMessage}
        </Alert>
      )}

      <Paper sx={{ mb: 3, p: 2 }}>
        <Box display="flex" gap={2}>
          <TextField
            fullWidth
            variant="outlined"
            placeholder="Search files..."
            value={searchTerm}
            onChange={handleSearch}
            InputProps={{
              startAdornment: <SearchIcon sx={{ color: 'action.active', mr: 1 }} />,
            }}
          />
          <FormControl variant="outlined" sx={{ minWidth: 200 }}>
            <InputLabel id="status-filter-label">Status</InputLabel>
            <Select
              labelId="status-filter-label"
              id="status-filter"
              value={statusFilter}
              onChange={handleStatusFilterChange}
              label="Status"
            >
              <MenuItem value="all">All Files</MenuItem>
              <MenuItem value="public">Public</MenuItem>
              <MenuItem value="private">Private</MenuItem>
            </Select>
          </FormControl>
        </Box>
      </Paper>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Title</TableCell>
              <TableCell>Filename</TableCell>
              <TableCell>Duration</TableCell>
              <TableCell>Size</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Uploaded</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredFiles.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                  {searchTerm || statusFilter !== 'all' 
                    ? 'No matching files found' 
                    : 'No audio files available. Upload your first file to get started.'}
                </TableCell>
              </TableRow>
            ) : (
              filteredFiles
                .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                .map((file) => (
                  <TableRow key={file.id} hover>
                    <TableCell>
                      <Box display="flex" alignItems="center">
                        <AudioFileIcon color="primary" sx={{ mr: 1 }} />
                        {file.title}
                      </Box>
                    </TableCell>
                    <TableCell>{file.filename}</TableCell>
                    <TableCell>{formatDuration(file.duration)}</TableCell>
                    <TableCell>{formatFileSize(file.size)}</TableCell>
                    <TableCell>
                      {file.isPublic ? (
                        <Chip
                          icon={<CheckCircleIcon />}
                          label="Public"
                          color="success"
                          size="small"
                        />
                      ) : (
                        <Chip
                          icon={<CancelIcon />}
                          label="Private"
                          color="default"
                          size="small"
                          variant="outlined"
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      {file.createdAt ? format(new Date(file.createdAt), 'MMM d, yyyy') : 'N/A'}
                    </TableCell>
                    <TableCell align="right">
                      <IconButton
                        size="small"
                        onClick={() => handleViewFile(file.id)}
                        color="primary"
                        title="Preview"
                      >
                        <VisibilityIcon />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => handleManageAccess(file.id)}
                        color="primary"
                        title="Manage Access"
                      >
                        <ManageAccountsIcon />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => handleEditFile(file.id)}
                        color="primary"
                        title="Edit"
                      >
                        <EditIcon />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => handleDeleteClick(file)}
                        color="error"
                        title="Delete"
                      >
                        <DeleteIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
            )}
          </TableBody>
        </Table>
        <TablePagination
          rowsPerPageOptions={[5, 10, 25]}
          component="div"
          count={filteredFiles.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
        />
      </TableContainer>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={handleDeleteCancel}
        aria-labelledby="delete-dialog-title"
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle id="delete-dialog-title">
          Confirm Delete
        </DialogTitle>
        <DialogContent>
          {deleteError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {deleteError}
            </Alert>
          )}
          <DialogContentText>
            Are you sure you want to delete the file <strong>"{fileToDelete?.title}"</strong>? 
            This action cannot be undone and will remove the file from the server.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel} disabled={deleteLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            color="error"
            variant="contained"
            disabled={deleteLoading}
            startIcon={deleteLoading ? <CircularProgress size={20} /> : null}
          >
            {deleteLoading ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default FileManagement;
