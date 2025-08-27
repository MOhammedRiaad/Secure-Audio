#!/bin/bash

# Nginx Configuration Fix Script
# This script fixes the invalid gzip_proxied directive

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

log "Fixing Nginx configuration..."

# Fix the gzip_proxied directive in the existing config
if [ -f "/etc/nginx/sites-available/secure-audio" ]; then
    log "Updating existing Nginx configuration..."
    sudo sed -i 's/gzip_proxied expired no-cache no-store private must-revalidate auth;/gzip_proxied expired no-cache no-store private auth;/' /etc/nginx/sites-available/secure-audio
    
    # Test configuration
    log "Testing Nginx configuration..."
    sudo nginx -t
    
    if [ $? -eq 0 ]; then
        log "Nginx configuration is valid!"
        log "Reloading Nginx..."
        sudo systemctl reload nginx
        log "Nginx reloaded successfully!"
    else
        error "Nginx configuration is still invalid!"
    fi
else
    error "Nginx configuration file not found!"
fi

log "Nginx fix completed!"
