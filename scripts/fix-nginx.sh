#!/bin/bash

# Nginx Configuration Fix Script
# This script fixes two common issues in the Secure-Audio Nginx setup:
# 1. An invalid 'gzip_proxied' directive value.
# 2. Misplaced 'limit_req_zone' directives (moves them from server to http context).

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

log "Starting Nginx configuration fix process..."

# --- Define paths and directives ---
NGINX_CONF="/etc/nginx/nginx.conf"
SITE_CONF="/etc/nginx/sites-available/secure-audio"
LIMIT_REQ_API='limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;'
LIMIT_REQ_LOGIN='limit_req_zone $binary_remote_addr zone=login:10m rate=1r/s;'

# Check if the site configuration file exists
if [ ! -f "$SITE_CONF" ]; then
    error "Nginx site configuration file not found at $SITE_CONF!"
fi

# --- Fix 1: Correct the gzip_proxied directive ---
log "1. Checking for invalid 'gzip_proxied' directive in $SITE_CONF..."
if grep -q "gzip_proxied expired no-cache no-store private must-revalidate auth;" "$SITE_CONF"; then
    info "Invalid 'gzip_proxied' directive found. Fixing it..."
    sudo sed -i 's/gzip_proxied expired no-cache no-store private must-revalidate auth;/gzip_proxied expired no-cache no-store private auth;/' "$SITE_CONF"
    log "'gzip_proxied' directive corrected."
else
    info "'gzip_proxied' directive is already correct or not found."
fi

# --- Fix 2: Move limit_req_zone directives ---
log "2. Checking for misplaced 'limit_req_zone' directives..."

# Remove from site config if they exist there
if grep -q "limit_req_zone" "$SITE_CONF"; then
    warning "'limit_req_zone' directives found in $SITE_CONF. Removing them..."
    sudo sed -i '/limit_req_zone/d' "$SITE_CONF"
    log "Removed 'limit_req_zone' from site configuration."
else
    info "No 'limit_req_zone' directives found in site configuration."
fi

# Add to nginx.conf if they don't exist there
log "3. Ensuring 'limit_req_zone' directives are in $NGINX_CONF..."
if ! grep -q "zone=api:10m" "$NGINX_CONF"; then
    info "Adding API rate limit to $NGINX_CONF..."
    sudo sed -i "/http {/a \    $LIMIT_REQ_API" "$NGINX_CONF"
else
    info "API rate limit already exists in $NGINX_CONF."
fi

if ! grep -q "zone=login:10m" "$NGINX_CONF"; then
    info "Adding Login rate limit to $NGINX_CONF..."
    sudo sed -i "/http {/a \    $LIMIT_REQ_LOGIN" "$NGINX_CONF"
else
    info "Login rate limit already exists in $NGINX_CONF."
fi

# --- Final Validation and Reload ---
log "4. Validating final Nginx configuration..."

sudo nginx -t

if [ $? -eq 0 ]; then
    log "Nginx configuration is valid!"
    info "Attempting to reload Nginx service..."
    sudo systemctl reload nginx
    log "Nginx reloaded successfully!"
else
    error "Nginx configuration test failed! Please review the changes made."
fi

log "Nginx fix script completed successfully!"
