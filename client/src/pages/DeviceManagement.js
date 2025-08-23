import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Typography, Box, Paper, Button } from '@mui/material';
import { ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import DeviceManagement from '../components/DeviceManagement';
import DeviceWarnings from '../components/DeviceWarnings';

const DeviceManagementPage = () => {
  const navigate = useNavigate();

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 3 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/')}
          sx={{ mb: 2 }}
        >
          Back to Library
        </Button>
        <Typography variant="h4" component="h1" gutterBottom>
          Device Security
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Manage your devices and monitor security alerts
        </Typography>
      </Box>
      
      {/* Device Warnings Section */}
      <Box sx={{ mb: 3 }}>
        <DeviceWarnings />
      </Box>
      
      {/* Device Management Section */}
      <Paper elevation={1} sx={{ p: 0, overflow: 'hidden' }}>
        <DeviceManagement />
      </Paper>
    </Container>
  );
};

export default DeviceManagementPage;