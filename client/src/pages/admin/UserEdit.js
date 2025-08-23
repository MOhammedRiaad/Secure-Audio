import React, { useState, useEffect } from 'react';
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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
  Grid,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Save as SaveIcon,
  Security as SecurityIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';

const UserEdit = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'user',
    isLocked: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const [terminateDialogOpen, setTerminateDialogOpen] = useState(false);
  const [sessionToTerminate, setSessionToTerminate] = useState(null);
  const [terminatingSession, setTerminatingSession] = useState(false);
  
  const navigate = useNavigate();
  const { id } = useParams();

  const fetchSessions = async () => {
    try {
      setSessionsLoading(true);
      setSessionError('');
      const res = await api.get(`/admin/users/${id}/sessions`);
      setSessions(res.data.data);
    } catch (err) {
      setSessionError('Failed to load session data');
      console.error('Error fetching sessions:', err);
    } finally {
      setSessionsLoading(false);
    }
  };

  useEffect(() => {
    const fetchUser = async () => {
      try {
        setLoading(true);
        const res = await api.get(`/admin/users/${id}`);
        const user = res.data.data;
        setFormData({
          name: user.name || '',
          email: user.email || '',
          role: user.role || 'user',
          isLocked: user.isLocked || false,
        });
        // Fetch sessions after user data is loaded
        await fetchSessions();
      } catch (err) {
        setError('Failed to load user data');
        console.error('Error fetching user:', err);
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchUser();
    }
  }, [id]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const res = await api.put(`/admin/users/${id}`, formData);
      setSuccess('User updated successfully!');
      setTimeout(() => {
        navigate('/admin/users');
      }, 2000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update user');
      console.error('Error updating user:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    navigate('/admin/users');
  };

  const handleTerminateSession = (session) => {
    setSessionToTerminate(session);
    setTerminateDialogOpen(true);
  };

  const handleTerminateConfirm = async () => {
    if (!sessionToTerminate) return;

    try {
      setTerminatingSession(true);
      await api.delete(`/admin/users/${id}/sessions/${sessionToTerminate.id}`);
      setSuccess('Session terminated successfully');
      setTerminateDialogOpen(false);
      setSessionToTerminate(null);
      // Refresh sessions list
      await fetchSessions();
    } catch (err) {
      setError('Failed to terminate session');
      console.error('Error terminating session:', err);
    } finally {
      setTerminatingSession(false);
    }
  };

  const handleTerminateCancel = () => {
    setTerminateDialogOpen(false);
    setSessionToTerminate(null);
  };

  const formatLastActivity = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box display="flex" alignItems="center" mb={4}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={handleBack}
          sx={{ mr: 2 }}
        >
          Back to Users
        </Button>
        <Typography variant="h4" component="h1">
          Edit User
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

      <Grid container spacing={3}>
        {/* User Details Form */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 4 }}>
            <Typography variant="h6" gutterBottom>
              User Details
            </Typography>
            <Box component="form" onSubmit={handleSubmit}>
              <TextField
                fullWidth
                label="Name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                sx={{ mb: 3 }}
              />
              
              <TextField
                fullWidth
                label="Email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                required
                sx={{ mb: 3 }}
              />
              
              <FormControl fullWidth sx={{ mb: 3 }}>
                <InputLabel id="role-label">Role</InputLabel>
                <Select
                  labelId="role-label"
                  name="role"
                  value={formData.role}
                  onChange={handleChange}
                  label="Role"
                >
                  <MenuItem value="user">User</MenuItem>
                  <MenuItem value="admin">Admin</MenuItem>
                </Select>
              </FormControl>
              
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.isLocked}
                    onChange={handleChange}
                    name="isLocked"
                  />
                }
                label="Lock User Account"
                sx={{ mb: 3 }}
              />
              
              <Box display="flex" gap={2}>
                <Button
                  type="submit"
                  variant="contained"
                  color="primary"
                  startIcon={<SaveIcon />}
                  disabled={saving}
                  sx={{ minWidth: 120 }}
                >
                  {saving ? <CircularProgress size={20} /> : 'Save Changes'}
                </Button>
                
                <Button
                  variant="outlined"
                  onClick={handleBack}
                  disabled={saving}
                >
                  Cancel
                </Button>
              </Box>
            </Box>
          </Paper>
        </Grid>

        {/* Session Monitoring */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 4 }}>
            <Box display="flex" alignItems="center" justifyContent="space-between" mb={3}>
              <Box display="flex" alignItems="center">
                <SecurityIcon sx={{ mr: 1 }} />
                <Typography variant="h6">
                  Active Sessions
                </Typography>
                {sessions.length > 1 && (
                  <Chip
                    label="Multiple Sessions"
                    color="warning"
                    size="small"
                    sx={{ ml: 2 }}
                  />
                )}
              </Box>
              <IconButton
                onClick={fetchSessions}
                disabled={sessionsLoading}
                size="small"
                title="Refresh Sessions"
              >
                <RefreshIcon />
              </IconButton>
            </Box>

            {sessionError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {sessionError}
              </Alert>
            )}

            {sessionsLoading ? (
              <Box display="flex" justifyContent="center" py={4}>
                <CircularProgress />
              </Box>
            ) : sessions.length === 0 ? (
              <Typography color="text.secondary" align="center" py={4}>
                No active sessions
              </Typography>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Device</TableCell>
                      <TableCell>Last Activity</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {sessions.map((session) => (
                      <TableRow key={session.id}>
                        <TableCell>
                          <Box>
                            <Typography variant="body2" fontWeight="medium">
                              {session.deviceName || 'Unknown Device'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {session.deviceType} • {session.ipAddress}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {formatLastActivity(session.lastActivity)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleTerminateSession(session)}
                            title="Terminate Session"
                          >
                            <DeleteIcon />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* Terminate Session Dialog */}
      <Dialog
        open={terminateDialogOpen}
        onClose={handleTerminateCancel}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Terminate Session</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to terminate this session? The user will be logged out from this device.
          </DialogContentText>
          {sessionToTerminate && (
            <Box mt={2} p={2} bgcolor="grey.100" borderRadius={1}>
              <Typography variant="body2">
                <strong>Device:</strong> {sessionToTerminate.deviceName || 'Unknown Device'}
              </Typography>
              <Typography variant="body2">
                <strong>IP Address:</strong> {sessionToTerminate.ipAddress}
              </Typography>
              <Typography variant="body2">
                <strong>Last Activity:</strong> {formatLastActivity(sessionToTerminate.lastActivity)}
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleTerminateCancel} disabled={terminatingSession}>
            Cancel
          </Button>
          <Button
            onClick={handleTerminateConfirm}
            color="error"
            variant="contained"
            disabled={terminatingSession}
            startIcon={terminatingSession ? <CircularProgress size={20} /> : null}
          >
            {terminatingSession ? 'Terminating...' : 'Terminate'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default UserEdit;