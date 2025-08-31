#!/bin/bash

# Quick .env Fix Script
# This script immediately fixes the DATABASE_URL in .env file

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

warning() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}

# Navigate to app directory
cd /var/www/secure-audio

# Check if .env exists
if [ ! -f ".env" ]; then
    error ".env file not found!"
fi

log "Current .env DATABASE_URL:"
grep "DATABASE_URL" .env

# Fix the DATABASE_URL
log "Fixing DATABASE_URL..."
DB_PASSWORD="SecureAudio2024"

# Create backup and fix .env safely
cp .env .env.backup
grep -v "^DATABASE_URL=" .env > .env.tmp
echo "DATABASE_URL=\"postgresql://secure_audio_user:$DB_PASSWORD@localhost:5432/secure_audio\"" >> .env.tmp
mv .env.tmp .env

log "Updated .env DATABASE_URL:"
grep "DATABASE_URL" .env

log ".env file fixed! You can now run the deployment script."
