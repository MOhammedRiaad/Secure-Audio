#!/bin/bash

# PM2 Fix Script for Secure-Audio
# This script fixes PM2 process issues

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

# Navigate to app directory
cd /var/www/secure-audio

log "Fixing PM2 process issues..."

# Stop any existing processes
log "Stopping any existing PM2 processes..."
pm2 stop all || true
pm2 delete all || true

# Clear PM2 logs
log "Clearing PM2 logs..."
pm2 flush

# Start fresh
log "Starting application fresh..."
pm2 start ecosystem.config.js --env production

# Save configuration
pm2 save

# Show status
log "PM2 Status:"
pm2 status

log "PM2 fix completed!"
info "Application should now be running properly."
