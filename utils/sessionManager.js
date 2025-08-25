const { PrismaClient } = require('@prisma/client');
const DeviceFingerprint = require('./deviceFingerprint');
const ErrorResponse = require('./errorResponse');
const NotificationService = require('./notificationService');

const prisma = new PrismaClient();

/**
 * Session Management System
 * Handles device-specific user sessions and security validation
 */
class SessionManager {
  /**
   * Create or validate a device session
   * @param {number} userId - User ID
   * @param {Object} req - Express request object
   * @param {Object} additionalData - Additional device data from client
   * @returns {Object} Session validation result
   */
  static async createOrValidateSession(userId, req, additionalData = {}) {
    try {
      // Get device information
      const deviceSession = DeviceFingerprint.createDeviceSession(req, additionalData);
      
      // Get user's max devices limit and device approval status
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { maxDevices: true, isLocked: true, deviceApprovalRequired: true }
      });
      
      if (!user) {
        throw new Error('User not found');
      }
      
      if (user.isLocked) {
        throw new Error('User account is locked');
      }
      
      // Check if this device already has an active session
      const existingSession = await prisma.activeSession.findUnique({
        where: {
          userId_deviceId: {
            userId,
            deviceId: deviceSession.deviceId
          }
        }
      });
      
      if (existingSession) {
        // Update existing session
        const updatedSession = await prisma.activeSession.update({
          where: { id: existingSession.id },
          data: {
            lastActivity: new Date(),
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
            isActive: true,
            ipAddress: deviceSession.ipAddress,
            userAgent: deviceSession.userAgent
          }
        });
        
        return {
          success: true,
          session: updatedSession,
          isNewDevice: false,
          deviceInfo: deviceSession
        };
      }
      
      // Check current active sessions count
      const activeSessions = await prisma.activeSession.findMany({
        where: {
          userId,
          isActive: true,
          expiresAt: { gt: new Date() }
        }
      });
      
      // If user requires device approval and has active sessions, prevent new device login
      if (user.deviceApprovalRequired && activeSessions.length > 0) {
        throw new Error('Device approval required - user has existing active sessions');
      }
      
      // If user has reached max devices limit, handle device limit
      if (activeSessions.length >= user.maxDevices) {
        const result = await this.handleDeviceLimit(userId, activeSessions, deviceSession);
        if (!result.success) {
          return result;
        }
      }
      
      // Create new session
      const newSession = await prisma.activeSession.create({
        data: {
          userId,
          deviceId: deviceSession.deviceId,
          deviceName: deviceSession.deviceName,
          deviceType: deviceSession.deviceType,
          deviceFingerprint: deviceSession.deviceFingerprint,
          ipAddress: deviceSession.ipAddress,
          userAgent: deviceSession.userAgent,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
        }
      });
      
      // Create notification for new device login
      await this.createDeviceNotification(userId, deviceSession, 'new_device');
      
      // Send email notification for new device login
      try {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (user) {
          await NotificationService.sendNewDeviceNotification(
            user,
            deviceSession,
            deviceSession.ipAddress
          );
        }
      } catch (error) {
        console.error('Failed to send new device email notification:', error);
      }
      
      return {
        success: true,
        session: newSession,
        isNewDevice: true,
        deviceInfo: deviceSession,
        lockedDevices: activeSessions.length >= user.maxDevices ? activeSessions.slice(0, -1) : []
      };
      
    } catch (error) {
      console.error('Session creation/validation error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Handle device limit exceeded scenario
   * @param {number} userId - User ID
   * @param {Array} activeSessions - Current active sessions
   * @param {Object} deviceSession - New device session data
   * @returns {Object} Result of device limit handling
   */
  static async handleDeviceLimit(userId, activeSessions, deviceSession) {
    try {
      // Sort sessions by last activity (oldest first)
      const sortedSessions = activeSessions.sort((a, b) => 
        new Date(a.lastActivity) - new Date(b.lastActivity)
      );
      
      // Deactivate the oldest session
      const sessionToDeactivate = sortedSessions[0];
      
      await prisma.activeSession.update({
        where: { id: sessionToDeactivate.id },
        data: { isActive: false }
      });
      
      // Create notification for device being locked
      await this.createDeviceNotification(
        userId, 
        {
          deviceId: sessionToDeactivate.deviceId,
          deviceName: sessionToDeactivate.deviceName,
          ipAddress: sessionToDeactivate.ipAddress
        }, 
        'device_locked'
      );
      
      // Send email notification for device lock
      try {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (user) {
          await NotificationService.sendDeviceLockedNotification(
            user,
            {
              deviceName: sessionToDeactivate.deviceName,
              ipAddress: sessionToDeactivate.ipAddress
            }
          );
        }
      } catch (error) {
        console.error('Failed to send device locked email notification:', error);
      }
      
      return {
        success: true,
        lockedDevice: sessionToDeactivate
      };
      
    } catch (error) {
      console.error('Device limit handling error:', error);
      return {
        success: false,
        error: 'Failed to handle device limit'
      };
    }
  }
  
  /**
   * Validate an active session
   * @param {number} userId - User ID
   * @param {string} deviceId - Device ID
   * @param {Object} req - Express request object
   * @returns {Object} Session validation result
   */
  static async validateSession(userId, deviceId, req) {
    try {
      const session = await prisma.activeSession.findUnique({
        where: {
          userId_deviceId: {
            userId,
            deviceId
          }
        }
      });
      
      if (!session) {
        return {
          valid: false,
          reason: 'Session not found'
        };
      }
      
      if (!session.isActive) {
        return {
          valid: false,
          reason: 'Session is inactive'
        };
      }
      
      if (session.expiresAt < new Date()) {
        // Deactivate expired session
        await prisma.activeSession.update({
          where: { id: session.id },
          data: { isActive: false }
        });
        
        return {
          valid: false,
          reason: 'Session expired'
        };
      }
      
      // Validate device fingerprint for additional security
      const currentDeviceSession = DeviceFingerprint.createDeviceSession(req);
      
      if (!DeviceFingerprint.validateFingerprint(
        session.deviceFingerprint, 
        currentDeviceSession.deviceFingerprint
      )) {
        // Suspicious activity detected
        await this.createDeviceNotification(userId, currentDeviceSession, 'suspicious_activity');
        
        return {
          valid: false,
          reason: 'Device fingerprint mismatch - suspicious activity detected'
        };
      }
      
      // Update last activity
      await prisma.activeSession.update({
        where: { id: session.id },
        data: { lastActivity: new Date() }
      });
      
      return {
        valid: true,
        session
      };
      
    } catch (error) {
      console.error('Session validation error:', error);
      return {
        valid: false,
        reason: 'Session validation failed'
      };
    }
  }
  
  /**
   * Deactivate a specific session
   * @param {number} userId - User ID
   * @param {string} deviceId - Device ID to deactivate
   * @returns {boolean} Success status
   */
  static async deactivateSession(userId, deviceId) {
    try {
      await prisma.activeSession.updateMany({
        where: {
          userId,
          deviceId,
          isActive: true
        },
        data: { isActive: false }
      });
      
      return true;
    } catch (error) {
      console.error('Session deactivation error:', error);
      return false;
    }
  }
  
  /**
   * Deactivate all sessions for a user
   * @param {number} userId - User ID
   * @returns {boolean} Success status
   */
  static async deactivateAllSessions(userId) {
    try {
      await prisma.activeSession.updateMany({
        where: {
          userId,
          isActive: true
        },
        data: { isActive: false }
      });
      
      return true;
    } catch (error) {
      console.error('All sessions deactivation error:', error);
      return false;
    }
  }
  
  /**
   * Get all active sessions for a user
   * @param {number} userId - User ID
   * @returns {Array} Active sessions
   */
  static async getUserActiveSessions(userId) {
    try {
      return await prisma.activeSession.findMany({
        where: {
          userId,
          isActive: true,
          expiresAt: { gt: new Date() }
        },
        orderBy: { lastActivity: 'desc' }
      });
    } catch (error) {
      console.error('Get user sessions error:', error);
      return [];
    }
  }
  
  /**
   * Clean up expired sessions
   * @returns {number} Number of cleaned sessions
   */
  static async cleanupExpiredSessions() {
    try {
      const result = await prisma.activeSession.updateMany({
        where: {
          OR: [
            { expiresAt: { lt: new Date() } },
            { lastActivity: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } // 7 days inactive
          ],
          isActive: true
        },
        data: { isActive: false }
      });
      
      return result.count;
    } catch (error) {
      console.error('Session cleanup error:', error);
      return 0;
    }
  }
  
  /**
   * Create a device notification
   * @param {number} userId - User ID
   * @param {Object} deviceInfo - Device information
   * @param {string} type - Notification type
   */
  static async createDeviceNotification(userId, deviceInfo, type) {
    try {
      await prisma.deviceNotification.create({
        data: {
          userId,
          deviceId: deviceInfo.deviceId,
          deviceName: deviceInfo.deviceName,
          ipAddress: deviceInfo.ipAddress,
          notificationType: type
        }
      });
      
      // Send email for suspicious activity
      if (type === 'suspicious_activity') {
        try {
          const user = await prisma.user.findUnique({ where: { id: userId } });
          if (user) {
            await NotificationService.sendSuspiciousActivityNotification(
               user,
               {
                 type: 'Suspicious Login Attempt',
                 description: this.generateNotificationMessage('suspicious_activity', deviceInfo),
                 ipAddress: deviceInfo.ipAddress
               }
             );
          }
        } catch (error) {
          console.error('Failed to send suspicious activity email notification:', error);
        }
      }
    } catch (error) {
      console.error('Device notification creation error:', error);
    }
  }
  
  /**
   * Get device notifications for a user
   * @param {number} userId - User ID
   * @param {boolean} unreadOnly - Get only unread notifications
   * @returns {Array} Device notifications
   */
  static async getDeviceNotifications(userId, unreadOnly = false) {
    try {
      const where = { userId };
      if (unreadOnly) {
        where.isRead = false;
      }
      
      return await prisma.deviceNotification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 50 // Limit to last 50 notifications
      });
    } catch (error) {
      console.error('Get device notifications error:', error);
      return [];
    }
  }
  
  /**
   * Mark device notifications as read
   * @param {number} userId - User ID
   * @param {Array} notificationIds - Notification IDs to mark as read
   * @returns {boolean} Success status
   */
  static async markNotificationsAsRead(userId, notificationIds) {
    try {
      await prisma.deviceNotification.updateMany({
        where: {
          userId,
          id: { in: notificationIds }
        },
        data: { isRead: true }
      });
      
      return true;
    } catch (error) {
      console.error('Mark notifications as read error:', error);
      return false;
    }
  }
}

module.exports = SessionManager;