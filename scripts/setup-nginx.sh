#!/bin/bash

# Secure-Audio Nginx Setup Script
# This script configures Nginx reverse proxy and SSL

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

# Get domain from user
if [ -z "$DOMAIN" ]; then
    read -p "Enter your domain name (e.g., yourdomain.com): " DOMAIN
fi

if [ -z "$DOMAIN" ]; then
    error "Domain name is required!"
fi

log "Setting up Nginx for domain: $DOMAIN"

# Add rate limiting zones to the main Nginx config file
log "Configuring rate limiting in /etc/nginx/nginx.conf..."
NGINX_CONF="/etc/nginx/nginx.conf"
LIMIT_REQ_API='limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;'
LIMIT_REQ_LOGIN='limit_req_zone $binary_remote_addr zone=login:10m rate=1r/s;'

if ! grep -q "zone=api:10m" "$NGINX_CONF"; then
    info "Adding API rate limit to $NGINX_CONF"
    sudo sed -i "/http {/a \    $LIMIT_REQ_API" "$NGINX_CONF"
else
    info "API rate limit already configured."
fi

if ! grep -q "zone=login:10m" "$NGINX_CONF"; then
    info "Adding Login rate limit to $NGINX_CONF"
    sudo sed -i "/http {/a \    $LIMIT_REQ_LOGIN" "$NGINX_CONF"
else
    info "Login rate limit already configured."
fi

# Create Nginx site configuration
log "Creating Nginx site configuration for secure-audio..."
sudo tee /etc/nginx/sites-available/secure-audio > /dev/null << EOF
# Nginx Configuration for Secure-Audio
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    
    # Temporary location for Let's Encrypt verification
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
    
    # Redirect HTTP to HTTPS (will be uncommented after SSL setup)
    # return 301 https://\$server_name\$request_uri;
    
    # Temporary proxy to Node.js (for initial testing)
    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

# Enable the site
log "Enabling Nginx site..."
sudo ln -sf /etc/nginx/sites-available/secure-audio /etc/nginx/sites-enabled/

# Remove default site
sudo rm -f /etc/nginx/sites-enabled/default

# Test Nginx configuration
log "Testing Nginx configuration..."
sudo nginx -t

# Restart Nginx
log "Restarting Nginx..."
sudo systemctl restart nginx

# Setup SSL with Let's Encrypt
log "Setting up SSL certificate..."
if sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN --non-interactive --agree-tos --email admin@$DOMAIN; then
    # Update Nginx config to redirect HTTP to HTTPS (only if certbot succeeded)
    log "Enabling HTTP->HTTPS redirect..."
    sudo sed -i 's/# return 301 https/return 301 https/' /etc/nginx/sites-available/secure-audio

    # Replace site configuration to serve React on HTTPS and proxy API
    log "Writing final Nginx site configuration (React at /, API at /api)..."
    sudo tee /etc/nginx/sites-available/secure-audio > /dev/null << EOF
# Secure-Audio Nginx Configuration

server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    # Allow ACME challenges
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Redirect all HTTP to HTTPS
    return 301 https://$server_name$request_uri;
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
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;

    # Gzip
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied expired no-cache no-store private auth;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/json application/xml+rss;

    # Serve React build
    root /var/www/secure-audio/client/build;
    index index.html;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # API proxy
    location /api/ {
        limit_req zone=api burst=20 nodelay;

        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        client_max_body_size 100M;
    }

    # Stricter rate limit for auth endpoints
    location /api/v1/auth/ {
        limit_req zone=login burst=5 nodelay;

        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Static uploads (optional)
    location /uploads/ {
        alias /var/www/secure-audio/uploads/;
        location ~* \.(php|pl|py|jsp|asp|sh|cgi)$ { deny all; }
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }
}
EOF

    # Test and reload Nginx
    sudo nginx -t && sudo systemctl reload nginx
else
    warning "SSL setup failed or was skipped. Keeping HTTP only for now."
    warning "You can run it manually later with: sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN"
fi

# Setup auto-renewal for SSL
log "Setting up SSL auto-renewal..."
(crontab -l 2>/dev/null; echo "0 12 * * * /usr/bin/certbot renew --quiet") | crontab -

# Update CORS in application
log "Updating CORS configuration..."
if [ -f "/var/www/secure-audio/.env" ]; then
    sed -i "s|CORS_ORIGIN=.*|CORS_ORIGIN=\"https://$DOMAIN,https://www.$DOMAIN,http://$DOMAIN,http://www.$DOMAIN\"|" /var/www/secure-audio/.env
    
    # Restart application to apply CORS changes
    pm2 restart secure-audio-api
fi

log "Nginx setup completed!"
info "Your application should now be available at:"
info "  HTTP:  http://$DOMAIN"
info "  HTTPS: https://$DOMAIN"
info ""
info "SSL certificate auto-renewal is configured."
info "Check certificate status with: sudo certbot certificates"
