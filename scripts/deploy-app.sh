#!/bin/bash

# Secure-Audio Application Deployment Script
# This script deploys or updates the Secure-Audio application

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

# Configuration
APP_DIR="/var/www/secure-audio"
REPO_URL="https://github.com/MOhammedRiaad/Secure-Audio.git"
BRANCH="main"

# Check if this is initial deployment or update
if [ -d "$APP_DIR/.git" ]; then
    DEPLOYMENT_TYPE="update"
    log "Detected existing installation - performing update..."
else
    DEPLOYMENT_TYPE="initial"
    log "Performing initial deployment..."
fi

if [ "$DEPLOYMENT_TYPE" = "initial" ]; then
    # Initial deployment
    log "Cloning repository..."
    if [ "$(ls -A $APP_DIR)" ]; then
        warning "Directory not empty, backing up and clearing..."
        # Create backup directory
        BACKUP_DIR="/tmp/secure-audio-backup-$(date +%s)"
        mkdir -p $BACKUP_DIR
        
        # Move existing files to backup (safer than rm -rf)
        mv $APP_DIR/* $BACKUP_DIR/ 2>/dev/null || true
        mv $APP_DIR/.[^.]* $BACKUP_DIR/ 2>/dev/null || true
        
        log "Existing files backed up to $BACKUP_DIR"
    fi
    
    # Clone repository
    git clone $REPO_URL $APP_DIR
    cd $APP_DIR
    
    # Check if .env file exists
    if [ ! -f ".env" ]; then
        if [ -f "/home/ubuntu/.env.template" ]; then
            log "Copying environment template..."
            cp /home/ubuntu/.env.template .env
            warning "Please update .env file with your domain and verify all settings!"
        else
            error ".env file not found! Please create it or run setup-database.sh first."
        fi
    fi
else
    # Update deployment
    cd $APP_DIR
    log "Stopping application..."
    pm2 stop secure-audio-api || true
    
    log "Pulling latest changes..."
    git fetch origin
    git reset --hard origin/$BRANCH
fi

# Install backend dependencies
log "Installing backend dependencies..."
npm install --production

# Install frontend dependencies and build
log "Building frontend..."
# cd client
# npm install
# npm run build
# cd ..
log "Skipping frontend build on server (using pre-built files from repo)..."

# Create uploads directory
log "Setting up uploads directory..."
mkdir -p uploads
chmod 755 uploads

# Verify database connection first
log "Verifying database connection..."
if [ -f ".env" ]; then
    log "Found .env file, checking DATABASE_URL..."
    grep "DATABASE_URL" .env || warning "DATABASE_URL not found in .env file"
else
    error ".env file not found! Database connection will fail."
fi

# Test database connection
log "Testing database connection..."
DB_PASSWORD="SecureAudio2024!@#"
PGPASSWORD=$DB_PASSWORD psql -h localhost -U secure_audio_user -d secure_audio -c "SELECT version();" > /dev/null 2>&1
if [ $? -eq 0 ]; then
    log "Database connection successful"
else
    error "Database connection failed. Please run setup-database.sh first or check your database configuration."
fi

# Run database migrations
log "Running database migrations..."
npx prisma migrate deploy

# Generate Prisma client
log "Generating Prisma client..."
npx prisma generate

# Create PM2 ecosystem file
log "Creating PM2 configuration..."
cat > ecosystem.config.js << 'EOF'
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
    node_args: '--max_old_space_size=512',
    watch: false,
    ignore_watch: ['node_modules', 'logs', 'uploads'],
    restart_delay: 4000
  }]
};
EOF

# Create logs directory
mkdir -p logs

# Set proper permissions
sudo chown -R ubuntu:ubuntu $APP_DIR
chmod -R 755 $APP_DIR

if [ "$DEPLOYMENT_TYPE" = "initial" ]; then
    # Start application with PM2
    log "Starting application..."
    pm2 start ecosystem.config.js --env production
    
    # Save PM2 configuration
    pm2 save
    
    # Setup PM2 startup script
    log "Setting up PM2 startup..."
    pm2 startup | grep "sudo" | bash || true
else
    # Restart application
    log "Restarting application..."
    pm2 restart secure-audio-api
fi

# Verify application is running
sleep 5
if pm2 list | grep -q "secure-audio-api.*online"; then
    log "Application is running successfully!"
else
    error "Application failed to start. Check logs with: pm2 logs"
fi

# Display status
log "Deployment completed!"
info "Application status:"
pm2 status

info "Useful commands:"
info "  View logs: pm2 logs secure-audio-api"
info "  Restart app: pm2 restart secure-audio-api"
info "  Monitor: pm2 monit"

if [ "$DEPLOYMENT_TYPE" = "initial" ]; then
    warning "Next steps:"
    warning "1. Update .env file with your domain"
    warning "2. Run setup-nginx.sh to configure web server"
    warning "3. Test the application at http://your-server-ip:5000"
fi
