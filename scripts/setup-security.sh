#!/bin/bash

# Secure-Audio Security Hardening Script
# This script implements security best practices

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}"
    exit 1
}

info() {
    echo -e "${BLUE}[INFO] $1${NC}"
}

warning() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}

log "Setting up security hardening..."

# Configure fail2ban
log "Configuring fail2ban..."
sudo tee /etc/fail2ban/jail.local > /dev/null << 'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5
backend = systemd

[sshd]
enabled = true
port = ssh
logpath = %(sshd_log)s
backend = %(sshd_backend)s

[nginx-http-auth]
enabled = true
filter = nginx-http-auth
port = http,https
logpath = /var/log/nginx/error.log

[nginx-limit-req]
enabled = true
filter = nginx-limit-req
port = http,https
logpath = /var/log/nginx/error.log
maxretry = 10
findtime = 600
bantime = 7200

[nginx-botsearch]
enabled = true
filter = nginx-botsearch
port = http,https
logpath = /var/log/nginx/access.log
maxretry = 2
EOF

# Create custom fail2ban filters
log "Creating custom fail2ban filters..."
sudo tee /etc/fail2ban/filter.d/nginx-limit-req.conf > /dev/null << 'EOF'
[Definition]
failregex = limiting requests, excess: .* by zone .*, client: <HOST>
ignoreregex =
EOF

sudo tee /etc/fail2ban/filter.d/nginx-botsearch.conf > /dev/null << 'EOF'
[Definition]
failregex = <HOST>.*GET.*(\.php|\.asp|\.exe|\.pl|\.cgi|\.scgi)
ignoreregex =
EOF

# Restart fail2ban
sudo systemctl restart fail2ban
sudo systemctl enable fail2ban

# Set proper file permissions
log "Setting secure file permissions..."
sudo chown -R ubuntu:ubuntu /var/www/secure-audio
sudo find /var/www/secure-audio -type f -exec chmod 644 {} \;
sudo find /var/www/secure-audio -type d -exec chmod 755 {} \;
sudo chmod +x /var/www/secure-audio/scripts/*.sh

# Secure uploads directory
sudo chmod 755 /var/www/secure-audio/uploads
sudo chown ubuntu:ubuntu /var/www/secure-audio/uploads

# Configure automatic security updates
log "Configuring automatic security updates..."
sudo apt install unattended-upgrades -y
sudo dpkg-reconfigure -plow unattended-upgrades

# Create backup script
log "Creating backup script..."
sudo tee /home/ubuntu/backup.sh > /dev/null << 'EOF'
#!/bin/bash
# Backup script for Secure-Audio

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/home/ubuntu/backups"
APP_DIR="/var/www/secure-audio"

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup database
sudo -u postgres pg_dump secure_audio > $BACKUP_DIR/db_backup_$DATE.sql

# Backup uploads
tar -czf $BACKUP_DIR/uploads_backup_$DATE.tar.gz -C $APP_DIR uploads/

# Backup application code
tar -czf $BACKUP_DIR/app_backup_$DATE.tar.gz -C $APP_DIR --exclude=node_modules --exclude=client/node_modules .

# Keep only last 7 days of backups
find $BACKUP_DIR -name "*.sql" -mtime +7 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete

echo "Backup completed: $DATE"
EOF

chmod +x /home/ubuntu/backup.sh

# Add backup to crontab
log "Setting up automated backups..."
(crontab -l 2>/dev/null; echo "0 2 * * * /home/ubuntu/backup.sh") | crontab -

# Setup log rotation
log "Configuring log rotation..."
sudo tee /etc/logrotate.d/secure-audio > /dev/null << 'EOF'
/var/www/secure-audio/logs/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 ubuntu ubuntu
    postrotate
        pm2 reload secure-audio-api
    endscript
}
EOF

log "Security hardening completed!"
info "Security features enabled:"
info "  ✓ Fail2ban with custom rules"
info "  ✓ Automatic security updates"
info "  ✓ Secure file permissions"
info "  ✓ Automated backups (daily at 2 AM)"
info "  ✓ Log rotation"
info ""
info "Monitor security with:"
info "  sudo fail2ban-client status"
info "  sudo fail2ban-client status nginx-limit-req"
