#!/bin/bash

# Secure-Audio Full Deployment Script
# This is the master script that orchestrates the complete deployment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
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

header() {
    echo -e "${PURPLE}================================${NC}"
    echo -e "${PURPLE} $1${NC}"
    echo -e "${PURPLE}================================${NC}"
}

# Check if running as ubuntu user
if [ "$USER" != "ubuntu" ]; then
    error "This script must be run as the ubuntu user"
fi

# Check if we're on Ubuntu
if ! grep -q "Ubuntu" /etc/os-release; then
    error "This script is designed for Ubuntu 22.04 LTS"
fi

header "SECURE-AUDIO FULL DEPLOYMENT"
log "Starting complete deployment process..."

# Get configuration from user
echo ""
info "Please provide the following information:"
read -p "Enter your domain name (e.g., yourdomain.com): " DOMAIN
read -p "Enter your GitHub repository URL: " REPO_URL
read -p "Enter your email for SSL certificate: " EMAIL

if [ -z "$DOMAIN" ] || [ -z "$REPO_URL" ] || [ -z "$EMAIL" ]; then
    error "All fields are required!"
fi

# Export variables for sub-scripts
export DOMAIN
export REPO_URL
export EMAIL

# Create scripts directory if it doesn't exist
mkdir -p /home/ubuntu/deployment-scripts
cd /home/ubuntu/deployment-scripts

# Download all scripts (assuming they're in the repo)
log "Preparing deployment scripts..."

# Make scripts executable
chmod +x /var/www/secure-audio/scripts/*.sh 2>/dev/null || true

header "STEP 1: SERVER SETUP"
log "Setting up server environment..."
if [ -f "/var/www/secure-audio/scripts/setup-server.sh" ]; then
    bash /var/www/secure-audio/scripts/setup-server.sh
else
    # Inline server setup if script not found
    log "Running inline server setup..."
    
    # Update system
    sudo apt update && sudo apt upgrade -y
    
    # Install Node.js
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
    
    # Install dependencies
    sudo apt install postgresql postgresql-contrib nginx git ffmpeg certbot python3-certbot-nginx fail2ban htop -y
    
    # Install PM2
    sudo npm install -g pm2
    
    # Start services
    sudo systemctl start postgresql nginx
    sudo systemctl enable postgresql nginx
    
    # Setup firewall
    sudo ufw --force enable
    sudo ufw allow ssh
    sudo ufw allow 'Nginx Full'
    
    # Create app directory
    sudo mkdir -p /var/www/secure-audio
    sudo chown ubuntu:ubuntu /var/www/secure-audio
fi

header "STEP 2: DATABASE SETUP"
log "Configuring PostgreSQL database..."
if [ -f "/var/www/secure-audio/scripts/setup-database.sh" ]; then
    bash /var/www/secure-audio/scripts/setup-database.sh
else
    # Inline database setup
    DB_PASSWORD=$(openssl rand -base64 32)
    log "Generated database password: $DB_PASSWORD"
    
    sudo -u postgres psql << EOF
CREATE DATABASE secure_audio;
CREATE USER secure_audio_user WITH ENCRYPTED PASSWORD '$DB_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE secure_audio TO secure_audio_user;
ALTER USER secure_audio_user CREATEDB;
\q
EOF

    # Create .env file
    cat > /var/www/secure-audio/.env << EOF
DATABASE_URL="postgresql://secure_audio_user:$DB_PASSWORD@localhost:5432/secure_audio"
JWT_SECRET="$(openssl rand -base64 32)"
JWT_EXPIRE="7d"
JWT_COOKIE_EXPIRE=7
DRM_SECRET_KEY="$(openssl rand -base64 32)"
ENCRYPTION_KEY="$(openssl rand -base64 32)"
SESSION_SECRET="$(openssl rand -base64 32)"
NODE_ENV=production
PORT=5000
CORS_ORIGIN="https://$DOMAIN,https://www.$DOMAIN,http://$DOMAIN,http://www.$DOMAIN"
MAX_FILE_SIZE=104857600
UPLOAD_PATH=./uploads
BCRYPT_ROUNDS=12
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
EOF
fi

header "STEP 3: APPLICATION DEPLOYMENT"
log "Deploying Secure-Audio application..."

# Update deploy script with correct repo URL
if [ -f "/var/www/secure-audio/scripts/deploy-app.sh" ]; then
    sed -i "s|REPO_URL=.*|REPO_URL=\"$REPO_URL\"|" /var/www/secure-audio/scripts/deploy-app.sh
    bash /var/www/secure-audio/scripts/deploy-app.sh
else
    # Inline app deployment
    cd /var/www/secure-audio
    
    if [ ! -d ".git" ]; then
        git clone $REPO_URL .
    fi
    
    # Install and build
    npm install --production
    cd client && npm install && npm run build && cd ..
    
    # Setup directories
    mkdir -p uploads logs
    chmod 755 uploads
    
    # Database migrations
    npx prisma migrate deploy
    npx prisma generate
    
    # PM2 setup
    cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'secure-audio-api',
    script: 'server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env_production: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    max_memory_restart: '1G'
  }]
};
EOF
    
    pm2 start ecosystem.config.js --env production
    pm2 save
    pm2 startup | grep "sudo" | bash || true
fi

header "STEP 4: NGINX & SSL SETUP"
log "Configuring Nginx and SSL..."
if [ -f "/var/www/secure-audio/scripts/setup-nginx.sh" ]; then
    bash /var/www/secure-audio/scripts/setup-nginx.sh
else
    # Inline Nginx setup
    sudo tee /etc/nginx/sites-available/secure-audio > /dev/null << EOF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / {
        proxy_pass http://localhost:5000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
    
    sudo ln -sf /etc/nginx/sites-available/secure-audio /etc/nginx/sites-enabled/
    sudo rm -f /etc/nginx/sites-enabled/default
    sudo nginx -t && sudo systemctl reload nginx
    
    # SSL setup
    sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN --non-interactive --agree-tos --email $EMAIL || warning "SSL setup failed - run manually later"
fi

header "STEP 5: SECURITY HARDENING"
log "Implementing security measures..."
if [ -f "/var/www/secure-audio/scripts/setup-security.sh" ]; then
    bash /var/www/secure-audio/scripts/setup-security.sh
else
    # Basic security setup
    sudo tee /etc/fail2ban/jail.local > /dev/null << 'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true

[nginx-http-auth]
enabled = true
EOF
    
    sudo systemctl restart fail2ban
    sudo systemctl enable fail2ban
    
    # File permissions
    sudo chown -R ubuntu:ubuntu /var/www/secure-audio
    sudo find /var/www/secure-audio -type f -exec chmod 644 {} \;
    sudo find /var/www/secure-audio -type d -exec chmod 755 {} \;
fi

header "DEPLOYMENT COMPLETE!"
log "Secure-Audio has been successfully deployed!"

echo ""
info "🎉 DEPLOYMENT SUMMARY:"
info "  Domain: https://$DOMAIN"
info "  Application: Running on PM2"
info "  Database: PostgreSQL configured"
info "  Web Server: Nginx with SSL"
info "  Security: Fail2ban enabled"
echo ""

info "📋 NEXT STEPS:"
info "1. Test your application at https://$DOMAIN"
info "2. Create your first admin user"
info "3. Upload some audio files"
info "4. Configure DNS if not done already"
echo ""

info "🔧 USEFUL COMMANDS:"
info "  Check app status: pm2 status"
info "  View app logs: pm2 logs secure-audio-api"
info "  Restart app: pm2 restart secure-audio-api"
info "  Check SSL: sudo certbot certificates"
info "  Monitor security: sudo fail2ban-client status"
echo ""

warning "⚠️  IMPORTANT:"
warning "- Save your database password from the .env file"
warning "- Ensure your domain DNS points to this server"
warning "- Test all functionality before going live"
warning "- Set up regular backups"

log "Deployment completed successfully! 🚀"
