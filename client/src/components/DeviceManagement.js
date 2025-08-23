import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './DeviceManagement.css';

const DeviceManagement = () => {
  const { getActiveDevices, deactivateDevice, deactivateOtherDevices } = useAuth();
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(null);

  useEffect(() => {
    loadDevices();
  }, []);

  const loadDevices = async () => {
    try {
      setLoading(true);
      const response = await getActiveDevices();
      setDevices(response.data || []);
      setError('');
    } catch (err) {
      setError('Failed to load devices');
      console.error('Error loading devices:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeactivateDevice = async (deviceId, deviceName) => {
    if (!window.confirm(`Are you sure you want to deactivate "${deviceName}"?`)) {
      return;
    }

    try {
      setActionLoading(deviceId);
      await deactivateDevice(deviceId);
      await loadDevices(); // Refresh the list
    } catch (err) {
      setError('Failed to deactivate device');
      console.error('Error deactivating device:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeactivateOthers = async () => {
    if (!window.confirm('Are you sure you want to deactivate all other devices? This will log you out from all other sessions.')) {
      return;
    }

    try {
      setActionLoading('others');
      const response = await deactivateOtherDevices();
      alert(`Successfully deactivated ${response.deactivatedCount} device(s)`);
      await loadDevices(); // Refresh the list
    } catch (err) {
      setError('Failed to deactivate other devices');
      console.error('Error deactivating other devices:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const getDeviceIcon = (deviceType) => {
    switch (deviceType.toLowerCase()) {
      case 'mobile':
        return '📱';
      case 'tablet':
        return '📱';
      case 'desktop':
      default:
        return '💻';
    }
  };

  if (loading) {
    return (
      <div className="device-management">
        <div className="loading">Loading devices...</div>
      </div>
    );
  }

  return (
    <div className="device-management">
      <div className="device-header">
        <h2>Device Management</h2>
        <p>Manage your active devices and sessions</p>
      </div>

      {error && (
        <div className="error-message">
          {error}
          <button onClick={loadDevices} className="retry-btn">Retry</button>
        </div>
      )}

      <div className="device-actions">
        <button
          onClick={handleDeactivateOthers}
          className="btn btn-warning"
          disabled={actionLoading === 'others' || devices.length <= 1}
        >
          {actionLoading === 'others' ? 'Deactivating...' : 'Deactivate All Other Devices'}
        </button>
        <button onClick={loadDevices} className="btn btn-secondary">
          Refresh
        </button>
      </div>

      <div className="devices-list">
        {devices.length === 0 ? (
          <div className="no-devices">
            <p>No active devices found</p>
          </div>
        ) : (
          devices.map((device) => (
            <div key={device.id} className={`device-card ${device.isCurrent ? 'current-device' : ''}`}>
              <div className="device-info">
                <div className="device-icon">
                  {getDeviceIcon(device.deviceType)}
                </div>
                <div className="device-details">
                  <h3>
                    {device.deviceName}
                    {device.isCurrent && <span className="current-badge">Current Device</span>}
                  </h3>
                  <p className="device-type">{device.deviceType}</p>
                  <p className="device-ip">IP: {device.ipAddress}</p>
                  <p className="device-activity">
                    Last activity: {formatDate(device.lastActivity)}
                  </p>
                  <p className="device-created">
                    First login: {formatDate(device.createdAt)}
                  </p>
                </div>
              </div>
              
              <div className="device-actions-card">
                {!device.isCurrent && (
                  <button
                    onClick={() => handleDeactivateDevice(device.deviceId, device.deviceName)}
                    className="btn btn-danger"
                    disabled={actionLoading === device.deviceId}
                  >
                    {actionLoading === device.deviceId ? 'Deactivating...' : 'Deactivate'}
                  </button>
                )}
                {device.isCurrent && (
                  <span className="current-device-note">
                    This is your current device
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="device-info-section">
        <h3>Security Information</h3>
        <div className="security-tips">
          <ul>
            <li>Regularly review your active devices and remove any you don't recognize</li>
            <li>If you see suspicious activity, deactivate all other devices immediately</li>
            <li>Each device login creates a unique session for enhanced security</li>
            <li>You can have up to your configured maximum number of active devices</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default DeviceManagement;