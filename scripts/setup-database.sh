#!/bin/bash

# Secure-Audio Database Setup Script
# This script configures PostgreSQL database for the application

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

# Database configuration
DB_NAME="secure_audio"
DB_USER="secure_audio_user"

# Generate secure password if not provided
if [ -z "$DB_PASSWORD" ]; then
    DB_PASSWORD=$(openssl rand -base64 32)
    log "Generated database password: $DB_PASSWORD"
    echo "IMPORTANT: Save this password for your .env file!"
fi

log "Setting up PostgreSQL database..."

# Create database and user
sudo -u postgres psql << EOF
-- Create database
CREATE DATABASE $DB_NAME;

-- Create user with password
CREATE USER $DB_USER WITH ENCRYPTED PASSWORD '$DB_PASSWORD';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
ALTER USER $DB_USER CREATEDB;

-- Exit
\q
EOF

# Test database connection
log "Testing database connection..."
PGPASSWORD=$DB_PASSWORD psql -h localhost -U $DB_USER -d $DB_NAME -c "SELECT version();" > /dev/null

if [ $? -eq 0 ]; then
    log "Database setup completed successfully!"
    info "Database URL: postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME"
else
    error "Database connection test failed!"
fi

# Create .env template
log "Creating environment template..."
cat > /home/ubuntu/.env.template << EOF
# Database Configuration
DATABASE_URL="postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME"

# JWT Configuration (CHANGE THESE!)
JWT_SECRET="$(openssl rand -base64 32)"
JWT_EXPIRE="7d"
JWT_COOKIE_EXPIRE=7

# Security Keys (CHANGE THESE!)
DRM_SECRET_KEY="$(openssl rand -base64 32)"
ENCRYPTION_KEY="$(openssl rand -base64 32)"
SESSION_SECRET="$(openssl rand -base64 32)"

# Application Configuration
NODE_ENV=production
PORT=5000
CORS_ORIGIN="https://yourdomain.com,http://yourdomain.com"

# File Upload
MAX_FILE_SIZE=104857600
UPLOAD_PATH=./uploads

# Security
BCRYPT_ROUNDS=12

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
EOF

log "Environment template created at /home/ubuntu/.env.template"
info "Copy this to your application directory and update the domain!"
