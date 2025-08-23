import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import PrivateRoute from './components/routing/PrivateRoute';
import AdminRoute from './components/routing/AdminRoute';

// Pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import AudioPlayer from './pages/AudioPlayer';
import AdminDashboard from './pages/admin/Dashboard';
import UserManagement from './pages/admin/UserManagement';
import FileManagement from './pages/admin/FileManagement';
import FileAccessManagement from './pages/admin/FileAccessManagement';
import FileUpload from './pages/admin/FileUpload';
import UserCreate from './pages/admin/UserCreate';
import UserEdit from './pages/admin/UserEdit';
import TestDRM from './pages/TestDRM';
import DeviceManagementPage from './pages/DeviceManagement';

const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
    background: {
      default: '#f5f5f5',
    },
  },
  typography: {
    fontFamily: [
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      '"Helvetica Neue"',
      'Arial',
      'sans-serif',
    ].join(','),
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            
            {/* Protected Routes */}
            <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
            <Route path="/player/:id" element={<PrivateRoute><AudioPlayer /></PrivateRoute>} />
            <Route path="/devices" element={<PrivateRoute><DeviceManagementPage /></PrivateRoute>} />
            
            {/* Admin Routes */}
            <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
            <Route path="/admin/users" element={<AdminRoute><UserManagement /></AdminRoute>} />
            <Route path="/admin/users/new" element={<AdminRoute><UserCreate /></AdminRoute>} />
            <Route path="/admin/users/edit/:id" element={<AdminRoute><UserEdit /></AdminRoute>} />
            <Route path="/admin/files" element={<AdminRoute><FileManagement /></AdminRoute>} />
            <Route path="/admin/files/new" element={<AdminRoute><FileUpload /></AdminRoute>} />
            <Route path="/admin/files/upload" element={<AdminRoute><FileUpload /></AdminRoute>} />
            <Route path="/admin/files/:fileId/access" element={<AdminRoute><FileAccessManagement /></AdminRoute>} />
            
            {/* Test Routes */}
            <Route path="/test-drm" element={<PrivateRoute><TestDRM /></PrivateRoute>} />
            
            {/* Catch all other routes */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
