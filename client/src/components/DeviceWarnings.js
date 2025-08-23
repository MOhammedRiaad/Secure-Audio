import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import './DeviceWarnings.css';

const DeviceWarnings = () => {
  const { deviceWarnings, clearDeviceWarnings } = useAuth();

  if (!deviceWarnings || deviceWarnings.length === 0) {
    return null;
  }

  const getWarningIcon = (type) => {
    switch (type) {
      case 'new_device':
        return '🔐';
      case 'device_locked':
        return '🚫';
      case 'suspicious_activity':
        return '⚠️';
      case 'max_devices_reached':
        return '📱';
      default:
        return '⚠️';
    }
  };

  const getWarningClass = (type) => {
    switch (type) {
      case 'new_device':
        return 'warning-info';
      case 'device_locked':
        return 'warning-danger';
      case 'suspicious_activity':
        return 'warning-danger';
      case 'max_devices_reached':
        return 'warning-warning';
      default:
        return 'warning-info';
    }
  };

  const formatWarningTitle = (type) => {
    switch (type) {
      case 'new_device':
        return 'New Device Login';
      case 'device_locked':
        return 'Device Session Locked';
      case 'suspicious_activity':
        return 'Suspicious Activity Detected';
      case 'max_devices_reached':
        return 'Maximum Devices Reached';
      default:
        return 'Security Alert';
    }
  };

  const handleDismiss = (warningId) => {
    // Remove specific warning
    const updatedWarnings = deviceWarnings.filter(warning => warning.id !== warningId);
    clearDeviceWarnings(updatedWarnings);
  };

  const handleDismissAll = () => {
    clearDeviceWarnings([]);
  };

  return (
    <div className="device-warnings">
      <div className="warnings-header">
        <h3>Security Alerts</h3>
        {deviceWarnings.length > 1 && (
          <button onClick={handleDismissAll} className="dismiss-all-btn">
            Dismiss All
          </button>
        )}
      </div>
      
      <div className="warnings-list">
        {deviceWarnings.map((warning, index) => (
          <div key={warning.id || index} className={`warning-item ${getWarningClass(warning.type)}`}>
            <div className="warning-content">
              <div className="warning-icon">
                {getWarningIcon(warning.type)}
              </div>
              <div className="warning-details">
                <h4>{formatWarningTitle(warning.type)}</h4>
                <p>{warning.message}</p>
                {warning.deviceName && (
                  <p className="warning-device">Device: {warning.deviceName}</p>
                )}
                {warning.timestamp && (
                  <p className="warning-time">
                    {new Date(warning.timestamp).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
            <button 
              onClick={() => handleDismiss(warning.id || index)}
              className="dismiss-btn"
              aria-label="Dismiss warning"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      
      <div className="warnings-footer">
        <p className="security-note">
          <strong>Security Tip:</strong> If you don't recognize any of these activities, 
          please change your password immediately and review your device list.
        </p>
      </div>
    </div>
  );
};

export default DeviceWarnings;