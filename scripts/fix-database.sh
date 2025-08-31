#!/bin/bash

# Database Fix Script for Secure-Audio
# This script fixes common database connection issues

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

# Database configuration
DB_NAME="secure_audio"
DB_USER="secure_audio_user"
DB_PASSWORD="SecureAudio2024"

log "Fixing database connection issues..."

# Check if PostgreSQL is running
log "Checking PostgreSQL service..."
if ! sudo systemctl is-active --quiet postgresql; then
    log "Starting PostgreSQL service..."
    sudo systemctl start postgresql
    sudo systemctl enable postgresql
fi

# Recreate database and user with proper permissions
log "Recreating database and user..."
sudo -u postgres psql << EOF
-- Drop existing connections
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();

-- Drop and recreate database
DROP DATABASE IF EXISTS $DB_NAME;
CREATE DATABASE $DB_NAME;

-- Drop and recreate user
DROP USER IF EXISTS $DB_USER;
CREATE USER $DB_USER WITH ENCRYPTED PASSWORD '$DB_PASSWORD';

-- Grant all privileges
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
ALTER USER $DB_USER CREATEDB;
ALTER USER $DB_USER SUPERUSER;

-- Connect to the database and grant schema permissions
\c $DB_NAME
GRANT ALL ON SCHEMA public TO $DB_USER;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $DB_USER;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $DB_USER;

\q
EOF

# Test database connection
log "Testing database connection..."
PGPASSWORD=$DB_PASSWORD psql -h localhost -U $DB_USER -d $DB_NAME -c "SELECT version();" > /dev/null

if [ $? -eq 0 ]; then
    log "Database connection successful!"
else
    error "Database connection still failing!"
fi

# Fix .env file if it exists
if [ -f "/var/www/secure-audio/.env" ]; then
    log "Updating .env file with correct DATABASE_URL..."
    sed -i "s|DATABASE_URL=.*|DATABASE_URL=\"postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME\"|" /var/www/secure-audio/.env
    log ".env file updated"
else
    warning ".env file not found at /var/www/secure-audio/.env"
fi

# Create fresh .env template
log "Creating fresh .env template..."
cat > /home/ubuntu/.env.template << EOF
# Database Configuration
DATABASE_URL="postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME"

# JWT Configuration
JWT_SECRET="$(openssl rand -base64 32)"
JWT_EXPIRE="1d"
JWT_COOKIE_EXPIRE=1

# Security Keys
DRM_SECRET_KEY="$(openssl rand -base64 32)"
ENCRYPTION_KEY="$(openssl rand -base64 32)"
SESSION_SECRET="$(openssl rand -base64 32)"

# Application Configuration
NODE_ENV=production
PORT=5000
CORS_ORIGIN="https://ahmedabulella.space,http://ahmedabulella.space"

# File Upload
MAX_FILE_SIZE=104857600
UPLOAD_PATH=./uploads

# Security
BCRYPT_ROUNDS=12

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
EOF

log "Database fix completed!"
info "Database URL: postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME"
info "You can now run the deployment script again."
