# Deployment Scripts

This directory contains automated deployment scripts for the Secure-Audio application on AWS EC2.

## 🚀 Quick Start

For a complete automated deployment, run:

```bash
# Make scripts executable
chmod +x scripts/*.sh

# Run full deployment (interactive)
./scripts/full-deployment.sh
```

## 📋 Individual Scripts

### 1. `setup-server.sh`
Sets up the basic server environment on Ubuntu 22.04 LTS.

**What it does:**
- Updates system packages
- Installs Node.js 18.x LTS
- Installs PostgreSQL
- Installs PM2, Nginx, Git, FFmpeg
- Configures firewall (UFW)
- Creates application directory

**Usage:**
```bash
./scripts/setup-server.sh
```

### 2. `setup-database.sh`
Configures PostgreSQL database and generates secure credentials.

**What it does:**
- Creates database and user
- Generates secure passwords
- Creates environment template
- Tests database connection

**Usage:**
```bash
./scripts/setup-database.sh
```

### 3. `deploy-app.sh`
Deploys or updates the Secure-Audio application.

**What it does:**
- Clones repository (initial) or pulls updates
- Installs dependencies
- Builds React frontend
- Runs database migrations
- Configures PM2 process manager
- Starts/restarts application

**Usage:**
```bash
# Update REPO_URL in the script first
./scripts/deploy-app.sh
```

### 4. `setup-nginx.sh`
Configures Nginx reverse proxy and SSL certificates.

**What it does:**
- Creates Nginx configuration
- Sets up reverse proxy
- Installs SSL certificates with Let's Encrypt
- Configures HTTPS redirects
- Updates CORS settings

**Usage:**
```bash
DOMAIN=yourdomain.com ./scripts/setup-nginx.sh
```

### 5. `setup-security.sh`
Implements security hardening measures.

**What it does:**
- Configures fail2ban with custom rules
- Sets secure file permissions
- Enables automatic security updates
- Creates backup script with cron job
- Sets up log rotation

**Usage:**
```bash
./scripts/setup-security.sh
```

### 6. `full-deployment.sh`
Master script that runs all deployment steps in sequence.

**What it does:**
- Orchestrates complete deployment
- Prompts for configuration (domain, repo, email)
- Runs all setup scripts in order
- Provides deployment summary
- Shows useful commands and next steps

**Usage:**
```bash
./scripts/full-deployment.sh
```

## 🔧 Prerequisites

- Fresh Ubuntu 22.04 LTS EC2 instance
- SSH access as `ubuntu` user
- Domain name pointing to your server
- GitHub repository with your code

## 📝 Configuration

Before running scripts, you may need to update:

1. **Repository URL** in `deploy-app.sh`:
   ```bash
   REPO_URL="https://github.com/MOhammedRiaad/Secure-Audio.git"
   ```

2. **Domain name** when prompted or via environment variable:
   ```bash
   export DOMAIN=ahmedabulella.space
   ```

## 🔍 Monitoring

After deployment, use these commands to monitor your application:

```bash
# Application status
pm2 status
pm2 logs secure-audio-api
pm2 monit

# System resources
htop
df -h
free -h

# Web server
sudo systemctl status nginx
sudo tail -f /var/log/nginx/access.log

# Security
sudo fail2ban-client status
sudo fail2ban-client status nginx-limit-req

# SSL certificates
sudo certbot certificates
```

## 🔄 Updates

To update your application:

```bash
cd /var/www/secure-audio
./scripts/deploy-app.sh
```

## 🛠️ Troubleshooting

### Application won't start
```bash
pm2 logs secure-audio-api
cat /var/www/secure-audio/.env
```

### Database connection issues
```bash
sudo -u postgres psql -l
sudo systemctl status postgresql
```

### SSL certificate problems
```bash
sudo certbot certificates
sudo nginx -t
sudo systemctl status nginx
```

### Permission errors
```bash
sudo chown -R ubuntu:ubuntu /var/www/secure-audio
sudo chmod -R 755 /var/www/secure-audio
```

## 📋 Security Checklist

After deployment, verify:

- [ ] Application accessible via HTTPS
- [ ] HTTP redirects to HTTPS
- [ ] Database credentials are secure
- [ ] Firewall is configured (UFW)
- [ ] Fail2ban is running
- [ ] SSL certificate auto-renewal is set up
- [ ] Backups are configured
- [ ] Log rotation is working

## 🔗 Related Files

- `../DEPLOYMENT.md` - Manual deployment guide
- `../AWS_EC2_DEPLOYMENT.md` - Detailed AWS EC2 instructions
- `../vercel.json` - Vercel deployment configuration
- `../.env.production` - Production environment template
