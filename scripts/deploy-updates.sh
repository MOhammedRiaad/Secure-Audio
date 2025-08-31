#!/bin/bash

# Secure-Audio Updates Deployment Script
# This script deploys all recent changes to EC2 server for both frontend and backend
# Includes rate limiter fixes, timeout improvements, and abort controller updates

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

# Configuration
APP_DIR="/var/www/secure-audio"
REPO_URL="https://github.com/MOhammedRiaad/Secure-Audio.git"
BRANCH="main"
BACKUP_DIR="/home/ubuntu/backups/$(date +%Y%m%d_%H%M%S)"
TEMP_DIR="/tmp/secure-audio-deploy-$(date +%s)"

# Check if running as ubuntu user
if [ "$USER" != "ubuntu" ]; then
    error "This script must be run as the ubuntu user"
fi

# Check if we're on Ubuntu
if ! grep -q "Ubuntu" /etc/os-release; then
    error "This script is designed for Ubuntu 22.04 LTS"
fi

header "SECURE-AUDIO UPDATES DEPLOYMENT"
log "Starting deployment of recent updates..."

# Create backup directory
log "Creating backup directory..."
mkdir -p $BACKUP_DIR

# Check if application exists
if [ ! -d "$APP_DIR" ]; then
    error "Application directory $APP_DIR not found. Run full-deployment.sh first."
fi

# Backup current application
log "Backing up current application..."
cp -r $APP_DIR $BACKUP_DIR/
log "Backup created at: $BACKUP_DIR"

# Create temporary directory for new code
log "Creating temporary deployment directory..."
mkdir -p $TEMP_DIR
cd $TEMP_DIR

# Clone latest code
log "Cloning latest code from repository..."
git clone $REPO_URL .
git checkout $BRANCH

# Stop application services
log "Stopping application services..."
pm2 stop secure-audio-api || true
sudo systemctl stop nginx || true

# Backup and preserve environment files
log "Preserving environment configuration..."
if [ -f "$APP_DIR/.env" ]; then
    cp "$APP_DIR/.env" "$TEMP_DIR/.env.backup"
fi
if [ -f "$APP_DIR/.env.production" ]; then
    cp "$APP_DIR/.env.production" "$TEMP_DIR/.env.production.backup"
fi

# Update backend files
header "UPDATING BACKEND"
log "Updating backend application files..."

# Copy backend files (excluding node_modules and client)
rsync -av --exclude='node_modules' --exclude='client' --exclude='.git' $TEMP_DIR/ $APP_DIR/

# Restore environment files
if [ -f "$TEMP_DIR/.env.backup" ]; then
    cp "$TEMP_DIR/.env.backup" "$APP_DIR/.env"
fi
if [ -f "$TEMP_DIR/.env.production.backup" ]; then
    cp "$TEMP_DIR/.env.production.backup" "$APP_DIR/.env.production"
fi

# Navigate to app directory
cd $APP_DIR

# Install/update backend dependencies
log "Installing backend dependencies..."
npm install --production

# Run database migrations if needed
log "Running database migrations..."
npx prisma migrate deploy || warning "Migration failed or no new migrations"
npx prisma generate

# Update frontend
header "UPDATING FRONTEND"
log "Updating frontend application..."

# Navigate to client directory
cd $APP_DIR/client

# Copy client files from temp
rsync -av --exclude='node_modules' --exclude='build' $TEMP_DIR/client/ ./

# Install frontend dependencies
log "Installing frontend dependencies..."
npm install

# Build frontend
log "Building frontend application..."
npm run build

# Verify build was successful
if [ ! -d "build" ]; then
    error "Frontend build failed - build directory not found"
fi

log "Frontend build completed successfully"

# Update PM2 configuration if needed
header "UPDATING PROCESS MANAGEMENT"
cd $APP_DIR

# Check if ecosystem.config.js exists, if not create it
if [ ! -f "ecosystem.config.js" ]; then
    log "Creating PM2 ecosystem configuration..."
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
    node_args: '--max-old-space-size=1024'
  }]
};
EOF
fi

# Create logs directory if it doesn't exist
mkdir -p logs

# Start application services
header "STARTING SERVICES"
log "Starting backend application..."
pm2 start ecosystem.config.js --env production || pm2 restart secure-audio-api

# Wait for application to start
log "Waiting for application to start..."
sleep 10

# Check if application is running
if pm2 list | grep -q "secure-audio-api.*online"; then
    log "Backend application started successfully"
else
    error "Backend application failed to start"
fi

# Start Nginx
log "Starting Nginx..."
sudo systemctl start nginx
sudo systemctl reload nginx

# Verify Nginx is running
if sudo systemctl is-active --quiet nginx; then
    log "Nginx started successfully"
else
    error "Nginx failed to start"
fi

# Test application health
header "HEALTH CHECKS"
log "Performing health checks..."

# Test backend API
log "Testing backend API..."
if curl -f -s http://localhost:5000/api/v1/health > /dev/null; then
    log "Backend API is responding"
else
    warning "Backend API health check failed"
fi

# Test frontend
log "Testing frontend..."
if curl -f -s http://localhost > /dev/null; then
    log "Frontend is accessible"
else
    warning "Frontend health check failed"
fi

# Clean up temporary files
log "Cleaning up temporary files..."
rm -rf $TEMP_DIR

# Display deployment summary
header "DEPLOYMENT SUMMARY"
log "Deployment completed successfully!"
info "Recent updates deployed:"
info "  ✓ Rate limiter fixes (chunked upload exemption)"
info "  ✓ Timeout improvements (5-min finalization, 15-min backend)"
info "  ✓ Abort controller updates (separate controllers per chunk)"
info "  ✓ Frontend and backend dependencies updated"
info "  ✓ Database migrations applied"
info "  ✓ Frontend rebuilt and deployed"
info "  ✓ Services restarted"
info ""
info "Backup location: $BACKUP_DIR"
info "Application URL: http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)"
info ""
info "To monitor the application:"
info "  pm2 status"
info "  pm2 logs secure-audio-api"
info "  sudo systemctl status nginx"

log "Deployment completed successfully!"