#!/bin/bash

# Secure-Audio AWS EC2 Server Setup Script
# This script automates the initial server setup on Ubuntu 22.04 LTS

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}"
    exit 1
}

warning() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}

info() {
    echo -e "${BLUE}[INFO] $1${NC}"
}

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   error "This script should not be run as root. Run as ubuntu user."
fi

log "Starting Secure-Audio server setup..."

# Update system
log "Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install Node.js 18.x LTS
log "Installing Node.js 18.x LTS..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify Node.js installation
NODE_VERSION=$(node --version)
NPM_VERSION=$(npm --version)
log "Node.js installed: $NODE_VERSION"
log "npm installed: $NPM_VERSION"

# Install PostgreSQL
log "Installing PostgreSQL..."
sudo apt install postgresql postgresql-contrib -y

# Start and enable PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Install PM2 globally
log "Installing PM2 process manager..."
sudo npm install -g pm2

# Install Nginx
log "Installing Nginx..."
sudo apt install nginx -y
sudo systemctl enable nginx

# Install additional dependencies
log "Installing additional dependencies..."
sudo apt install git ffmpeg certbot python3-certbot-nginx fail2ban htop -y

# Create application directory
log "Creating application directory..."
sudo mkdir -p /var/www/secure-audio
sudo chown ubuntu:ubuntu /var/www/secure-audio

# Configure UFW firewall
log "Configuring firewall..."
sudo ufw --force enable
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'

# Create logs directory
mkdir -p /home/ubuntu/logs

log "Basic server setup completed!"
info "Next steps:"
info "1. Run setup-database.sh to configure PostgreSQL"
info "2. Run deploy-app.sh to deploy the application"
info "3. Run setup-nginx.sh to configure Nginx and SSL"

log "Server setup completed successfully!"
