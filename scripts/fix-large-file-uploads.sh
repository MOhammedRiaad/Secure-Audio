#!/bin/bash

# Fix Large File Upload Issues in Nginx
# This script addresses 502 errors and file size limits for large uploads

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

log "Starting large file upload fix for Nginx..."

# Define paths
SITE_CONF="/etc/nginx/sites-available/secure-audio"
NGINX_CONF="/etc/nginx/nginx.conf"

# Check if site configuration exists
if [ ! -f "$SITE_CONF" ]; then
    error "Nginx site configuration not found at $SITE_CONF"
fi

# Backup current configuration
log "Backing up current Nginx configuration..."
sudo cp "$SITE_CONF" "$SITE_CONF.backup.$(date +%Y%m%d_%H%M%S)"

# Get domain from existing config
DOMAIN=$(grep -oP 'server_name \K[^;]*' "$SITE_CONF" | head -1 | awk '{print $1}')
if [ -z "$DOMAIN" ]; then
    error "Could not determine domain from existing configuration"
fi

log "Detected domain: $DOMAIN"

# Create optimized configuration for large file uploads
log "Creating optimized Nginx configuration for large file uploads..."
sudo tee "$SITE_CONF" > /dev/null << EOF
# Secure-Audio Nginx Configuration - Optimized for Large File Uploads

server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    # Allow ACME challenges
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Redirect all HTTP to HTTPS
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $DOMAIN www.$DOMAIN;

    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;

    # Gzip Compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied expired no-cache no-store private auth;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/json application/xml+rss;

    # Global settings for large files
    client_max_body_size 2G;
    client_body_buffer_size 128k;
    
    # Serve React build
    root /var/www/secure-audio/client/build;
    index index.html;

    # SPA fallback
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)\$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files \$uri =404;
    }

    # Special handling for large file uploads - NO RATE LIMITING
    location /api/v1/files {
        # Large file upload settings
        client_max_body_size 2G;
        # Buffer size for reading client request body
        # Increased from default 8k/16k to handle larger chunks of uploaded data
        client_body_buffer_size 128k;
        # Disable proxy buffering for large files
        proxy_request_buffering off;
        proxy_buffering off;
        
        # Extended timeouts - 15 minutes for uploads
        proxy_connect_timeout 900s;
        proxy_send_timeout 900s;
        proxy_read_timeout 900s;
        client_body_timeout 900s;
        client_header_timeout 900s;
        
        # Proxy settings
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection "";
        
        # Additional headers for large uploads
        proxy_set_header X-Accel-Buffering no;
    }

    # Regular API endpoints - NO RATE LIMITING FOR UPLOADS
    location /api/ {
        
        # Standard timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Stricter rate limit for auth endpoints
    location /api/v1/auth/ {
        limit_req zone=login burst=5 nodelay;
        
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Static uploads (if needed)
    location /uploads/ {
        alias /var/www/secure-audio/uploads/;
        location ~* \.(php|pl|py|jsp|asp|sh|cgi)\$ { deny all; }
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }
}
EOF

# Update main nginx.conf for large file handling
log "Updating main Nginx configuration for large files..."

# Add or update worker_rlimit_nofile
if ! grep -q "worker_rlimit_nofile" "$NGINX_CONF"; then
    sudo sed -i '/worker_processes/a worker_rlimit_nofile 65535;' "$NGINX_CONF"
fi

# Add large file settings to http block if not present
if ! grep -q "client_max_body_size 2G" "$NGINX_CONF"; then
    sudo sed -i '/http {/a \    # Large file upload settings - 15 minute timeouts' "$NGINX_CONF"
    sudo sed -i '/http {/a \    client_max_body_size 2G;' "$NGINX_CONF"
    sudo sed -i '/http {/a \    client_body_timeout 900s;' "$NGINX_CONF"
    sudo sed -i '/http {/a \    client_header_timeout 900s;' "$NGINX_CONF"
    sudo sed -i '/http {/a \    proxy_read_timeout 900s;' "$NGINX_CONF"
    sudo sed -i '/http {/a \    proxy_send_timeout 900s;' "$NGINX_CONF"
    sudo sed -i '/http {/a \    proxy_connect_timeout 900s;' "$NGINX_CONF"
fi

# Test configuration
log "Testing Nginx configuration..."
if sudo nginx -t; then
    log "Nginx configuration test passed!"
else
    error "Nginx configuration test failed! Restoring backup..."
    sudo cp "$SITE_CONF.backup.*" "$SITE_CONF"
    exit 1
fi

# Reload Nginx
log "Reloading Nginx..."
sudo systemctl reload nginx

log "Large file upload fix completed successfully!"
info "Configuration changes:"
info "  - Increased client_max_body_size to 2G"
info "  - Added dedicated /api/v1/files location with extended timeouts"
info "  - Disabled proxy buffering for large uploads"
info "  - Removed rate limiting for file uploads"
info "  - Extended all timeout values"
info ""
info "Your server should now handle files up to 2GB without 502 errors."
info "Monitor with: sudo tail -f /var/log/nginx/error.log"