import React from 'react';
import { Container, Typography, Box, Paper } from '@mui/material';
import DeviceManagement from '../components/DeviceManagement';
import DeviceWarnings from '../components/DeviceWarnings';

const DeviceManagementPage = () => {
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 3 }}>
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