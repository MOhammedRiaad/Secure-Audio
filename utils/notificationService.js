const nodemailer = require('nodemailer');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

class NotificationService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }

  initializeTransporter() {
    // Configure email transporter based on environment
    if (process.env.NODE_ENV === 'production') {
      // Production email configuration
      this.transporter = nodemailer.createTransport({
        service: process.env.EMAIL_SERVICE || 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD
        }
      });
    } else {
      // Development/testing configuration (using Ethereal Email)
      this.transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        auth: {
          user: process.env.ETHEREAL_USER || 'ethereal.user@ethereal.email',
          pass: process.env.ETHEREAL_PASS || 'ethereal.pass'
        }
      });
    }
  }

  /**
   * Send new device login notification
   * @param {Object} user - User object
   * @param {Object} deviceInfo - Device information
   * @param {string} ipAddress - IP address of the new device
   */
  async sendNewDeviceNotification(user, deviceInfo, ipAddress) {
    try {
      const subject = 'New Device Login - Secure Audio';
      const html = this.generateNewDeviceEmailTemplate(user, deviceInfo, ipAddress);
      
      await this.sendEmail(user.email, subject, html);
      
      console.log(`New device notification sent to ${user.email}`);
    } catch (error) {
      console.error('Failed to send new device notification:', error);
    }
  }

  /**
   * Send device locked notification
   * @param {Object} user - User object
   * @param {Object} deviceInfo - Device information that was locked
   */
  async sendDeviceLockedNotification(user, deviceInfo) {
    try {
      const subject = 'Device Session Locked - Secure Audio';
      const html = this.generateDeviceLockedEmailTemplate(user, deviceInfo);
      
      await this.sendEmail(user.email, subject, html);
      
      console.log(`Device locked notification sent to ${user.email}`);
    } catch (error) {
      console.error('Failed to send device locked notification:', error);
    }
  }

  /**
   * Send suspicious activity notification
   * @param {Object} user - User object
   * @param {Object} activityInfo - Suspicious activity details
   */
  async sendSuspiciousActivityNotification(user, activityInfo) {
    try {
      const subject = 'Suspicious Activity Detected - Secure Audio';
      const html = this.generateSuspiciousActivityEmailTemplate(user, activityInfo);
      
      await this.sendEmail(user.email, subject, html);
      
      console.log(`Suspicious activity notification sent to ${user.email}`);
    } catch (error) {
      console.error('Failed to send suspicious activity notification:', error);
    }
  }

  /**
   * Send email using configured transporter
   * @param {string} to - Recipient email
   * @param {string} subject - Email subject
   * @param {string} html - Email HTML content
   */
  async sendEmail(to, subject, html) {
    if (!this.transporter) {
      throw new Error('Email transporter not configured');
    }

    const mailOptions = {
      from: process.env.EMAIL_FROM || 'noreply@secureaudio.com',
      to,
      subject,
      html
    };

    const info = await this.transporter.sendMail(mailOptions);
    
    if (process.env.NODE_ENV === 'development') {
      console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
    }
    
    return info;
  }

  /**
   * Generate HTML template for new device notification
   */
  generateNewDeviceEmailTemplate(user, deviceInfo, ipAddress) {
    const currentDate = new Date().toLocaleString();
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>New Device Login</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #007bff; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f8f9fa; }
          .device-info { background-color: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .warning { background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>New Device Login Detected</h1>
          </div>
          <div class="content">
            <p>Hello ${user.email},</p>
            <p>We detected a new device login to your Secure Audio account.</p>
            
            <div class="device-info">
              <h3>Device Information:</h3>
              <ul>
                <li><strong>Device:</strong> ${deviceInfo.deviceName}</li>
                <li><strong>Type:</strong> ${deviceInfo.deviceType}</li>
                <li><strong>Browser:</strong> ${deviceInfo.browser}</li>
                <li><strong>Operating System:</strong> ${deviceInfo.os}</li>
                <li><strong>IP Address:</strong> ${ipAddress}</li>
                <li><strong>Login Time:</strong> ${currentDate}</li>
              </ul>
            </div>
            
            <div class="warning">
              <p><strong>Was this you?</strong></p>
              <p>If you recognize this login, you can ignore this email. If you don't recognize this activity, please:</p>
              <ul>
                <li>Change your password immediately</li>
                <li>Review your active devices in your account settings</li>
                <li>Contact our support team if you need assistance</li>
              </ul>
            </div>
            
            <p>For your security, any previous sessions on other devices have been automatically locked.</p>
          </div>
          <div class="footer">
            <p>This is an automated security notification from Secure Audio.</p>
            <p>If you have any concerns, please contact our support team.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate HTML template for device locked notification
   */
  generateDeviceLockedEmailTemplate(user, deviceInfo) {
    const currentDate = new Date().toLocaleString();
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Device Session Locked</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #dc3545; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f8f9fa; }
          .device-info { background-color: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .info { background-color: #d1ecf1; border: 1px solid #bee5eb; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Device Session Locked</h1>
          </div>
          <div class="content">
            <p>Hello ${user.email},</p>
            <p>A device session has been locked on your Secure Audio account due to a new device login.</p>
            
            <div class="device-info">
              <h3>Locked Device Information:</h3>
              <ul>
                <li><strong>Device:</strong> ${deviceInfo.deviceName}</li>
                <li><strong>IP Address:</strong> ${deviceInfo.ipAddress}</li>
                <li><strong>Locked Time:</strong> ${currentDate}</li>
              </ul>
            </div>
            
            <div class="info">
              <p><strong>What happened?</strong></p>
              <p>When you log in from a new device, we automatically lock previous sessions to protect your account security.</p>
              <p>If you want to use multiple devices simultaneously, you can adjust your device settings in your account preferences.</p>
            </div>
            
            <p>To continue using the locked device, simply log in again from that device.</p>
          </div>
          <div class="footer">
            <p>This is an automated security notification from Secure Audio.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate HTML template for suspicious activity notification
   */
  generateSuspiciousActivityEmailTemplate(user, activityInfo) {
    const currentDate = new Date().toLocaleString();
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Suspicious Activity Detected</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #dc3545; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f8f9fa; }
          .activity-info { background-color: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .alert { background-color: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>⚠️ Suspicious Activity Detected</h1>
          </div>
          <div class="content">
            <p>Hello ${user.email},</p>
            <p>We detected suspicious activity on your Secure Audio account that requires your immediate attention.</p>
            
            <div class="activity-info">
              <h3>Activity Details:</h3>
              <ul>
                <li><strong>Activity Type:</strong> ${activityInfo.type}</li>
                <li><strong>Description:</strong> ${activityInfo.description}</li>
                <li><strong>IP Address:</strong> ${activityInfo.ipAddress}</li>
                <li><strong>Time:</strong> ${currentDate}</li>
              </ul>
            </div>
            
            <div class="alert">
              <p><strong>Immediate Action Required:</strong></p>
              <ul>
                <li>Change your password immediately</li>
                <li>Review all active devices and remove any you don't recognize</li>
                <li>Enable two-factor authentication if not already enabled</li>
                <li>Contact our support team immediately</li>
              </ul>
            </div>
            
            <p>For your security, we have temporarily locked your account. Please log in to verify your identity and secure your account.</p>
          </div>
          <div class="footer">
            <p>This is an automated security alert from Secure Audio.</p>
            <p><strong>If you did not perform this activity, contact support immediately.</strong></p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}

module.exports = new NotificationService();