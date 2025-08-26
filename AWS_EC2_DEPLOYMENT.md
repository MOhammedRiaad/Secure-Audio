# AWS EC2 Deployment Guide

## 🚀 Deploy Secure-Audio on AWS EC2

### Prerequisites
- AWS Account with EC2 access
- Domain name (optional but recommended)
- SSL certificate (Let's Encrypt recommended)
- Basic Linux/Ubuntu knowledge

---

## 1. EC2 Instance Setup

### Step 1: Launch EC2 Instance
1. **Go to AWS Console** → EC2 → Launch Instance
2. **Choose AMI**: Ubuntu Server 22.04 LTS (Free Tier eligible)
3. **Instance Type**: t3.medium or larger (t2.micro for testing only)
4. **Key Pair**: Create new or use existing SSH key
5. **Security Group**: Configure ports:
   - SSH (22) - Your IP only
   - HTTP (80) - 0.0.0.0/0
   - HTTPS (443) - 0.0.0.0/0
   - Custom (5000) - 0.0.0.0/0 (temporary for testing)
6. **Storage**: 20GB+ SSD (gp3 recommended)
7. **Launch Instance**

### Step 2: Connect to Instance
```bash
# Connect via SSH
ssh -i your-key.pem ubuntu@your-ec2-public-ip

# Update system
sudo apt update && sudo apt upgrade -y
```

---

## 2. Server Environment Setup

### Step 1: Install Node.js & npm
```bash
# Install Node.js 18.x LTS
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version
npm --version
```

### Step 2: Install PostgreSQL
```bash
# Install PostgreSQL
sudo apt install postgresql postgresql-contrib -y

# Start and enable PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create database and user
sudo -u postgres psql
```

```sql
-- In PostgreSQL shell
CREATE DATABASE secure_audio;
CREATE USER secure_audio_user WITH ENCRYPTED PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE secure_audio TO secure_audio_user;
ALTER USER secure_audio_user CREATEDB;
\q
```

### Step 3: Install Additional Dependencies
```bash
# Install PM2 for process management
sudo npm install -g pm2

# Install Nginx
sudo apt install nginx -y

# Install Git
sudo apt install git -y

# Install FFmpeg (for audio processing)
sudo apt install ffmpeg -y

# Install certbot for SSL
sudo apt install certbot python3-certbot-nginx -y
```

---

## 3. Application Deployment

### Step 1: Clone Repository
```bash
# Create app directory
sudo mkdir -p /var/www/secure-audio
sudo chown ubuntu:ubuntu /var/www/secure-audio
cd /var/www/secure-audio

# Clone your repository
git clone https://github.com/yourusername/secure-audio.git .

# Install backend dependencies
npm install

# Install frontend dependencies
cd client
npm install
npm run build
cd ..
```

### Step 2: Environment Configuration
```bash
# Create production environment file
nano .env.production
```

```bash
# Production Environment Variables
NODE_ENV=production
PORT=5000

# Database
DATABASE_URL="postgresql://secure_audio_user:your_secure_password@localhost:5432/secure_audio"

# JWT
JWT_SECRET="your-super-secure-jwt-secret-at-least-32-characters"
JWT_EXPIRE="7d"
JWT_COOKIE_EXPIRE=7

# CORS
CORS_ORIGIN="https://yourdomain.com,http://yourdomain.com"

# File Upload
MAX_FILE_SIZE=104857600
UPLOAD_PATH=./uploads

# Security
BCRYPT_ROUNDS=12
DRM_SECRET_KEY="your-drm-secret-key-32-characters-long"
ENCRYPTION_KEY="your-32-character-encryption-key-here"
SESSION_SECRET="your-session-secret-32-characters-long"

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
```

### Step 3: Database Setup
```bash
# Copy environment variables
cp .env.production .env

# Run database migrations
npx prisma migrate deploy

# Generate Prisma client
npx prisma generate

# Seed database (optional)
npm run seed
```

### Step 4: Create Upload Directory
```bash
# Create uploads directory with proper permissions
mkdir -p uploads
chmod 755 uploads
```

---

## 4. Process Management with PM2

### Step 1: PM2 Configuration
```bash
# Create PM2 ecosystem file
nano ecosystem.config.js
```

```javascript
module.exports = {
  apps: [{
    name: 'secure-audio-api',
    script: 'server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'development'
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    max_memory_restart: '1G',
    node_args: '--max_old_space_size=1024'
  }]
};
```

### Step 2: Start Application
```bash
# Create logs directory
mkdir -p logs

# Start application with PM2
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save

# Setup PM2 startup script
pm2 startup
# Follow the instructions provided by the command above
```

---

## 5. Nginx Configuration

### Step 1: Create Nginx Configuration
```bash
# Create Nginx site configuration
sudo nano /etc/nginx/sites-available/secure-audio
```

```nginx
# Nginx Configuration for Secure-Audio
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;
    
    # SSL Configuration (will be added by certbot)
    
    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;
    
    # Gzip Compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied expired no-cache no-store private must-revalidate auth;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/javascript;
    
    # Rate Limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=login:10m rate=1r/s;
    
    # Serve React Frontend
    location / {
        root /var/www/secure-audio/client/build;
        index index.html index.htm;
        try_files $uri $uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
    
    # API Proxy
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Increase timeouts for file uploads
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        client_max_body_size 100M;
    }
    
    # Special rate limiting for auth endpoints
    location /api/v1/auth/ {
        limit_req zone=login burst=5 nodelay;
        
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # Serve uploaded files securely
    location /uploads/ {
        alias /var/www/secure-audio/uploads/;
        
        # Security: prevent execution of uploaded files
        location ~* \.(php|pl|py|jsp|asp|sh|cgi)$ {
            deny all;
        }
        
        # Cache uploaded files
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }
}
```

### Step 2: Enable Site
```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/secure-audio /etc/nginx/sites-enabled/

# Remove default site
sudo rm /etc/nginx/sites-enabled/default

# Test Nginx configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

---

## 6. SSL Certificate Setup

### Step 1: Install SSL Certificate
```bash
# Install SSL certificate with Let's Encrypt
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Test automatic renewal
sudo certbot renew --dry-run
```

### Step 2: Setup Auto-renewal
```bash
# Add cron job for certificate renewal
sudo crontab -e

# Add this line:
0 12 * * * /usr/bin/certbot renew --quiet
```

---

## 7. Firewall Configuration

```bash
# Configure UFW firewall
sudo ufw enable
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'
sudo ufw status
```

---

## 8. Monitoring & Maintenance

### Step 1: Setup Log Rotation
```bash
# Create logrotate configuration
sudo nano /etc/logrotate.d/secure-audio
```

```
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
```

### Step 2: Monitoring Commands
```bash
# Monitor PM2 processes
pm2 status
pm2 logs
pm2 monit

# Monitor system resources
htop
df -h
free -h

# Monitor Nginx
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Monitor application logs
tail -f /var/www/secure-audio/logs/combined.log
```

### Step 3: Backup Strategy
```bash
# Create backup script
nano /home/ubuntu/backup.sh
```

```bash
#!/bin/bash
# Backup script for Secure-Audio

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/home/ubuntu/backups"
APP_DIR="/var/www/secure-audio"

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup database
pg_dump -h localhost -U secure_audio_user secure_audio > $BACKUP_DIR/db_backup_$DATE.sql

# Backup uploads
tar -czf $BACKUP_DIR/uploads_backup_$DATE.tar.gz -C $APP_DIR uploads/

# Backup application code
tar -czf $BACKUP_DIR/app_backup_$DATE.tar.gz -C $APP_DIR --exclude=node_modules --exclude=client/node_modules .

# Keep only last 7 days of backups
find $BACKUP_DIR -name "*.sql" -mtime +7 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete

echo "Backup completed: $DATE"
```

```bash
# Make backup script executable
chmod +x /home/ubuntu/backup.sh

# Add to crontab for daily backups
crontab -e
# Add: 0 2 * * * /home/ubuntu/backup.sh
```

---

## 9. Performance Optimization

### Step 1: Node.js Optimization
```bash
# Optimize Node.js for production
echo 'export NODE_OPTIONS="--max-old-space-size=1024"' >> ~/.bashrc
source ~/.bashrc
```

### Step 2: Database Optimization
```bash
# Optimize PostgreSQL
sudo nano /etc/postgresql/14/main/postgresql.conf
```

```
# Add these optimizations
shared_buffers = 256MB
effective_cache_size = 1GB
maintenance_work_mem = 64MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200
```

```bash
# Restart PostgreSQL
sudo systemctl restart postgresql
```

---

## 10. Security Hardening

### Step 1: System Security
```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install fail2ban
sudo apt install fail2ban -y

# Configure fail2ban for Nginx
sudo nano /etc/fail2ban/jail.local
```

```ini
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[nginx-http-auth]
enabled = true

[nginx-limit-req]
enabled = true
filter = nginx-limit-req
action = iptables-multiport[name=ReqLimit, port="http,https", protocol=tcp]
logpath = /var/log/nginx/error.log
maxretry = 10
findtime = 600
bantime = 7200
```

### Step 2: Application Security
```bash
# Set proper file permissions
sudo chown -R ubuntu:ubuntu /var/www/secure-audio
chmod -R 755 /var/www/secure-audio
chmod -R 644 /var/www/secure-audio/uploads
```

---

## 11. Deployment Commands Summary

```bash
# Quick deployment script
#!/bin/bash

# Pull latest changes
cd /var/www/secure-audio
git pull origin main

# Install dependencies
npm install
cd client && npm install && npm run build && cd ..

# Run migrations
npx prisma migrate deploy
npx prisma generate

# Restart application
pm2 restart secure-audio-api

# Reload Nginx
sudo nginx -s reload

echo "Deployment completed successfully!"
```

---

## 12. Troubleshooting

### Common Issues:

**Application won't start:**
```bash
pm2 logs secure-audio-api
sudo systemctl status nginx
```

**Database connection issues:**
```bash
sudo -u postgres psql -c "\l"
netstat -an | grep 5432
```

**SSL certificate issues:**
```bash
sudo certbot certificates
sudo nginx -t
```

**High memory usage:**
```bash
pm2 restart secure-audio-api
free -h
```

**File upload issues:**
```bash
ls -la /var/www/secure-audio/uploads/
df -h
```

---

## 📞 Support Checklist

- [ ] EC2 instance running and accessible
- [ ] Node.js and npm installed
- [ ] PostgreSQL configured and running
- [ ] Application deployed and PM2 running
- [ ] Nginx configured and running
- [ ] SSL certificate installed
- [ ] Firewall configured
- [ ] Monitoring setup
- [ ] Backup strategy implemented
- [ ] Domain pointing to EC2 instance

---

## 🔗 Useful Commands

```bash
# System monitoring
htop                          # System resources
pm2 status                    # Application status
sudo systemctl status nginx  # Nginx status
sudo systemctl status postgresql # Database status

# Application management
pm2 restart secure-audio-api  # Restart app
pm2 logs                      # View logs
pm2 reload secure-audio-api   # Zero-downtime reload

# Nginx management
sudo nginx -t                 # Test configuration
sudo nginx -s reload          # Reload configuration
sudo systemctl restart nginx # Restart Nginx

# Database management
sudo -u postgres psql secure_audio  # Connect to database
npx prisma studio                    # Database GUI
```

This guide provides a complete production deployment setup for your Secure-Audio application on AWS EC2 with proper security, monitoring, and maintenance procedures.
