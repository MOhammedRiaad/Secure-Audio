import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
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
  Button,
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
  FormControl,
  InputLabel,
  Select,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  PersonAdd as PersonAddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  AccessTime as AccessTimeIcon,
} from '@mui/icons-material';
import { format, parseISO, isAfter } from 'date-fns';

const FileAccessManagement = () => {
  const { fileId } = useParams();
  const navigate = useNavigate();
  
  const [file, setFile] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [accessToDelete, setAccessToDelete] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    const fetchFileAccess = async () => {
      try {
        setLoading(true);
        const res = await axios.get(`/api/v1/admin/file-access/file/${fileId}`);
        setFile(res.data.data.file);
        setAllUsers(res.data.data.allUsers);
      } catch (err) {
        setError('Failed to load file access data');
        console.error('Error fetching file access:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchFileAccess();
  }, [fileId]);

  const handleGrantAccess = async (e) => {
    e.preventDefault();
    
    if (!selectedUser) {
      setError('Please select a user');
      return;
    }

    try {
      setError('');
      setSuccess('');
      
      await axios.post('/api/v1/admin/file-access', {
        userId: selectedUser,
        fileId: parseInt(fileId),
        expiresAt: expiresAt || null,
      });
      
      setSuccess('Access granted successfully');
      
      // Refresh the file access data
      const res = await axios.get(`/api/v1/admin/file-access/file/${fileId}`);
      setFile(res.data.data.file);
      
      // Reset form
      setSelectedUser('');
      setExpiresAt('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to grant access');
      console.error('Error granting access:', err);
    }
  };

  const handleUpdateAccess = async (accessId, updates) => {
    try {
      await axios.put(`/api/v1/admin/file-access/${accessId}`, updates);
      
      // Refresh the file access data
      const res = await axios.get(`/api/v1/admin/file-access/file/${fileId}`);
      setFile(res.data.data.file);
      
      setSuccess('Access updated successfully');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update access');
      console.error('Error updating access:', err);
    }
  };

  const handleDeleteClick = (access) => {
    setAccessToDelete(access);
    setOpenDialog(true);
  };

  const handleDeleteConfirm = async () => {
    if (!accessToDelete) return;
    
    try {
      setDeleteLoading(true);
      setDeleteError('');
      
      await axios.delete(`/api/v1/admin/file-access/${accessToDelete.id}`);
      
      // Refresh the file access data
      const res = await axios.get(`/api/v1/admin/file-access/file/${fileId}`);
      setFile(res.data.data.file);
      
      setSuccess('Access revoked successfully');
      setOpenDialog(false);
      setAccessToDelete(null);
    } catch (err) {
      setDeleteError(err.response?.data?.error || 'Failed to revoke access');
      console.error('Error revoking access:', err);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteCancel = () => {
    setOpenDialog(false);
    setAccessToDelete(null);
    setDeleteError('');
  };

  const getStatusBadge = (access) => {
    if (access.expiresAt && isAfter(new Date(), new Date(access.expiresAt))) {
      return (
        <Chip
          icon={<CancelIcon />}
          label="Expired"
          color="error"
          size="small"
          variant="outlined"
        />
      );
    }
    
    if (!access.canView) {
      return (
        <Chip
          icon={<CancelIcon />}
          label="Revoked"
          color="default"
          size="small"
          variant="outlined"
        />
      );
    }
    
    return (
      <Chip
        icon={<CheckCircleIcon />}
        label="Active"
        color="success"
        size="small"
      />
    );
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <CircularProgress />
      </Box>
    );
  }

  if (!file) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Alert severity="error">File not found</Alert>
      </Container>
    );
  }

  // Get user IDs that already have access
  const usersWithAccess = file.fileAccesses.map(access => access.user.id);
  // Filter out users who already have access
  const availableUsers = allUsers.filter(user => !usersWithAccess.includes(user.id));

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box display="flex" alignItems="center" mb={3}>
        <IconButton onClick={() => navigate(-1)} sx={{ mr: 1 }}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h4" component="h1">
          Manage Access: {file.title}
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      
      {success && (
        <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}

      <Paper sx={{ p: 3, mb: 4 }}>
        <Typography variant="h6" gutterBottom>
          Grant Access to User
        </Typography>
        
        <Box component="form" onSubmit={handleGrantAccess} sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
          <FormControl sx={{ minWidth: 250 }} size="small">
            <InputLabel id="user-select-label">Select User</InputLabel>
            <Select
              labelId="user-select-label"
              id="user-select"
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              label="Select User"
              required
            >
              {availableUsers.map((user) => (
                <MenuItem key={user.id} value={user.id}>
                  {user.name} ({user.email})
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          
          <TextField
            id="expires-at"
            label="Expires At (Optional)"
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            InputLabelProps={{
              shrink: true,
            }}
            size="small"
          />
          
          <Button
            type="submit"
            variant="contained"
            color="primary"
            startIcon={<PersonAddIcon />}
            disabled={availableUsers.length === 0}
            sx={{ height: 40 }}
          >
            Grant Access
          </Button>
        </Box>
        
        {availableUsers.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontStyle: 'italic' }}>
            All users already have access to this file.
          </Typography>
        )}
      </Paper>

      <Typography variant="h6" gutterBottom>
        Current Access
      </Typography>
      
      {file.fileAccesses.length === 0 ? (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="text.secondary">
            No users have been granted access to this file yet.
          </Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>User</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Access Granted</TableCell>
                <TableCell>Expires</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {file.fileAccesses.map((access) => (
                <TableRow key={access.id}>
                  <TableCell>
                    <Box>
                      <Typography variant="subtitle2">{access.user.name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {access.user.email}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(access)}
                  </TableCell>
                  <TableCell>
                    {format(parseISO(access.grantedAt), 'MMM d, yyyy HH:mm')}
                  </TableCell>
                  <TableCell>
                    {access.expiresAt ? (
                      <Box display="flex" alignItems="center">
                        <AccessTimeIcon color="action" fontSize="small" sx={{ mr: 0.5 }} />
                        {format(parseISO(access.expiresAt), 'MMM d, yyyy HH:mm')}
                      </Box>
                    ) : (
                      'Never'
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Revoke Access">
                      <IconButton
                        size="small"
                        onClick={() => handleDeleteClick(access)}
                        color="error"
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={openDialog}
        onClose={handleDeleteCancel}
        aria-labelledby="delete-dialog-title"
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle id="delete-dialog-title">
          Revoke Access
        </DialogTitle>
        <DialogContent>
          {deleteError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {deleteError}
            </Alert>
          )}
          <DialogContentText>
            Are you sure you want to revoke access for <strong>{accessToDelete?.user?.name}</strong> to <strong>{file?.title}</strong>?
            This action cannot be undone.
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
            {deleteLoading ? 'Revoking...' : 'Revoke Access'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default FileAccessManagement;
