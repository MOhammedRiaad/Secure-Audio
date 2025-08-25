import React from 'react';
import './DeviceApprovalModal.css';

const DeviceApprovalModal = ({ open, onApprove, onCancel, message }) => {
  if (!open) return null;

  const handleApprove = () => {
    onApprove();
  };

  const handleCancel = () => {
    onCancel();
  };

  // Prevent modal from closing when clicking on the modal content
  const handleModalClick = (e) => {
    e.stopPropagation();
  };

  return (
    <div className="device-approval-overlay" onClick={handleCancel}>
      <div className="device-approval-modal" onClick={handleModalClick}>
        <div className="modal-header">
          <h2>⚠️ Device Security Notice</h2>
        </div>
        
        <div className="modal-content">
          <div className="warning-icon">
            🔒
          </div>
          
          <div className="message-content">
            <h3>Single Device Policy</h3>
            <p className="primary-message">
              {message || 'This application only allows login from one device at a time.'}
            </p>
            
            <div className="warning-box">
              <p><strong>⚠️ Important Warning:</strong></p>
              <p>
                If you proceed and later attempt to login from another device, 
                <strong> your account will be permanently locked</strong> for security reasons.
              </p>
            </div>
            
            <div className="policy-details">
              <h4>Security Policy:</h4>
              <ul>
                <li>✓ Only one active device session allowed</li>
                <li>✓ Account protection against unauthorized access</li>
                <li>⚠️ Multi-device login attempts result in account lockout</li>
                <li>📞 Contact support to unlock a locked account</li>
              </ul>
            </div>
          </div>
        </div>
        
        <div className="modal-actions">
          <button 
            className="btn-cancel" 
            onClick={handleCancel}
            type="button"
          >
            Cancel Login
          </button>
          <button 
            className="btn-approve" 
            onClick={handleApprove}
            type="button"
          >
            I Understand - Proceed
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeviceApprovalModal;