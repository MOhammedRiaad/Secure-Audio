import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
// Conditionally import @expo/vector-icons only for non-web platforms
let Ionicons;
if (Platform.OS !== 'web') {
  Ionicons = require('@expo/vector-icons').Ionicons;
}

const DeviceApprovalModal = ({ visible, onApprove, onCancel, message }) => {
  const renderIcon = (iconName, size, color) => {
    if (Platform.OS === 'web') {
      const iconMap = {
        'warning': '⚠️',
        'lock-closed': '🔒',
        'checkmark-circle': '✅',
        'call': '📞'
      };
      return <Text style={{ fontSize: size, color }}>{iconMap[iconName] || '•'}</Text>;
    } else {
      return <Ionicons name={iconName} size={size} color={color} />;
    }
  };

  const handleApprove = () => {
    Alert.alert(
      'Confirm Device Approval',
      'Are you sure you want to proceed? Attempting to login from another device later will permanently lock your account.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'I Understand - Proceed', onPress: onApprove, style: 'destructive' }
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            {renderIcon("warning", 32, "#FF6B35")}
            <Text style={styles.title}>Device Security Notice</Text>
          </View>

          <View style={styles.content}>
            <View style={styles.lockIcon}>
              {renderIcon("lock-closed", 48, "#007AFF")}
            </View>

            <Text style={styles.subtitle}>Single Device Policy</Text>
            <Text style={styles.message}>
              {message || 'This application only allows login from one device at a time.'}
            </Text>

            <View style={styles.warningBox}>
              <Text style={styles.warningTitle}>⚠️ Important Warning:</Text>
              <Text style={styles.warningText}>
                If you proceed and later attempt to login from another device,{' '}
                <Text style={styles.boldText}>your account will be permanently locked</Text> for security reasons.
              </Text>
            </View>

            <View style={styles.policyDetails}>
              <Text style={styles.policyTitle}>Security Policy:</Text>
              <View style={styles.policyItem}>
                {renderIcon("checkmark-circle", 16, "#28a745")}
                <Text style={styles.policyText}>Only one active device session allowed</Text>
              </View>
              <View style={styles.policyItem}>
                {renderIcon("checkmark-circle", 16, "#28a745")}
                <Text style={styles.policyText}>Account protection against unauthorized access</Text>
              </View>
              <View style={styles.policyItem}>
                {renderIcon("warning", 16, "#FF6B35")}
                <Text style={styles.policyText}>Multi-device login attempts result in account lockout</Text>
              </View>
              <View style={styles.policyItem}>
                {renderIcon("call", 16, "#007AFF")}
                <Text style={styles.policyText}>Contact support to unlock a locked account</Text>
              </View>
            </View>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
              <Text style={styles.cancelButtonText}>Cancel Login</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.approveButton} onPress={handleApprove}>
              <Text style={styles.approveButtonText}>I Understand - Proceed</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginLeft: 12,
  },
  content: {
    alignItems: 'center',
    marginBottom: 20,
  },
  lockIcon: {
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  warningBox: {
    backgroundColor: '#FFF3CD',
    borderColor: '#FFEAA7',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    width: '100%',
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#856404',
    marginBottom: 4,
  },
  warningText: {
    fontSize: 13,
    color: '#856404',
    lineHeight: 18,
  },
  boldText: {
    fontWeight: 'bold',
  },
  policyDetails: {
    width: '100%',
  },
  policyTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  policyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  policyText: {
    fontSize: 12,
    color: '#666',
    marginLeft: 8,
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cancelButton: {
    backgroundColor: '#6c757d',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    flex: 1,
    marginRight: 8,
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  approveButton: {
    backgroundColor: '#dc3545',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    flex: 1,
    marginLeft: 8,
  },
  approveButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default DeviceApprovalModal;
