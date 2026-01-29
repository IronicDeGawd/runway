# Runway Deployment Guide

Complete guide for deploying Runway to production servers, specifically optimized for AWS EC2 instances.

## Table of Contents
- [Quick Start](#quick-start)
- [Deployment Methods](#deployment-methods)
- [Creating Releases](#creating-releases)
- [EC2 Auto-Deployment](#ec2-auto-deployment)
- [Manual Deployment](#manual-deployment)
- [Troubleshooting](#troubleshooting)

---

## Quick Start

### For EC2 Instances (Automated)

1. **Launch EC2 instance** with Ubuntu 22.04 LTS
2. **Copy the contents of `ec2-user-data.sh`** and paste into EC2 User Data field
3. **Wait 5-10 minutes** for automatic installation
4. **Access dashboard** at `http://YOUR_EC2_IP/`

> **Note:** The script is pre-configured for `IronicDeGawd/runway` repository. No changes needed unless you forked the repo.

### For Existing Servers (Manual)

```bash
# Download and run bootstrap script (installs latest release)
curl -sSL https://raw.githubusercontent.com/IronicDeGawd/runway/main/bootstrap.sh | sudo bash

# Or install a specific version
curl -sSL https://raw.githubusercontent.com/IronicDeGawd/runway/main/bootstrap.sh | sudo bash -s v0.1.0-beta.1
```

---

## Deployment Methods

### Method 1: GitHub Releases (Recommended for Production)

**Best for:**
- Production deployments
- EC2 auto-deployment
- Versioned releases
- Team deployments

**Workflow:**
```
Local Build → Create Release → GitHub Release → EC2 Auto-Install
```

### Method 2: Direct Deploy (Development)

**Best for:**
- Development testing
- Quick iterations
- Direct server access

**Workflow:**
```
Local Build → SCP to Server → Run Installer
```

Uses the existing `deploy.sh` script.

---

## Creating Releases

### Step 1: Prepare Release Locally

```bash
# Build and package for release
./prepare-release.sh v0.1.0-beta.1
```

**What it does:**
- ✅ Cleans previous builds
- ✅ Installs fresh dependencies
- ✅ Builds all workspaces (ui, server, shared)
- ✅ Creates production ZIP (~5-10MB)
- ✅ Generates SHA256 checksum

**Output:**
```
releases/
├── runway-release-v0.1.0-beta.1.zip
└── runway-release-v0.1.0-beta.1.zip.sha256
```

### Step 2: Create Git Tag

```bash
# Create and push tag
git tag v0.1.0-beta.1
git push origin v0.1.0-beta.1
```

### Step 3: Create GitHub Release

**Option A: Manual (Recommended)**

1. Go to `https://github.com/IronicDeGawd/runway/releases/new`
2. Select tag: `v0.1.0-beta.1`
3. Release title: `Release v0.1.0-beta.1`
4. Mark as **pre-release** for beta versions
5. Upload: `runway-release-v0.1.0-beta.1.zip`
6. Add release notes
7. Publish release

**Option B: GitHub Actions (Optional)**

1. Go to `Actions` tab in GitHub
2. Select `Create Release` workflow
3. Click `Run workflow`
4. Enter version: `v0.1.0-beta.1`
5. Mark as pre-release: ✅
6. Run workflow

### Release Package Contents

The release ZIP contains **only production files**:

```
runway-release-v0.1.0-beta.1.zip
├── server/
│   ├── dist/              # Compiled TypeScript backend
│   ├── scripts/           # Runtime scripts (setup-auth.js)
│   └── package.json       # Server dependencies
├── ui/
│   └── dist/              # Built React frontend
├── shared/
│   ├── dist/              # Compiled shared code
│   └── package.json       # Shared package metadata
├── package.json           # Root dependencies
├── package-lock.json      # Lock file
├── ecosystem.config.js    # PM2 configuration
└── install.sh             # Installation script
```

**Not included** (to keep size small):
- ❌ Source code (`src/` directories)
- ❌ `node_modules/`
- ❌ Development files
- ❌ Test projects

---

## EC2 Auto-Deployment

### Prerequisites

- AWS Account
- EC2 key pair created
- Security group with ports: 22 (SSH), 80 (HTTP), 443 (HTTPS)

### Launch Configuration

**AMI:** Ubuntu 22.04 LTS (recommended)
**Instance Type:** t2.small or larger (min 1GB RAM)
**Storage:** 10GB minimum, 20GB recommended

### User Data Setup

1. **Copy the entire contents** of `ec2-user-data.sh`

2. **Paste into EC2 User Data** field during instance launch

3. **Launch the instance**

> **Pre-configured settings:**
> - Repository: `IronicDeGawd/runway` (already set)
> - Version: `latest` (installs most recent release)
>
> **Optional:** Change `VERSION="latest"` to `VERSION="v0.1.0-beta.1"` for a specific version

### What Happens on First Boot

```
1. System updates                  (1-2 min)
2. Install prerequisites           (30 sec)
3. Download bootstrap script       (5 sec)
4. Download release from GitHub    (30 sec)
5. Extract package                 (10 sec)
6. Install Node.js (via NVM)       (2-3 min)
7. Install PM2                     (30 sec)
8. Install Caddy                   (30 sec)
9. Install Docker (optional)       (1-2 min)
10. Setup auth credentials         (manual input required)
11. Start services                 (30 sec)
12. Configure startup              (30 sec)

Total: ~5-10 minutes
```

### Monitoring Installation

SSH into instance and check logs:

```bash
# Watch bootstrap log
sudo tail -f /var/log/runway-bootstrap.log

# Check if services are running
pm2 status
sudo systemctl status caddy
```

### Access Dashboard

```bash
# Get your instance IP
curl http://169.254.169.254/latest/meta-data/public-ipv4

# Access at:
http://YOUR_EC2_IP/
```

---

## Manual Deployment

### Method 1: Using Bootstrap Script

```bash
# Install latest release
curl -sSL https://raw.githubusercontent.com/IronicDeGawd/runway/main/bootstrap.sh | sudo bash

# Or install a specific version
curl -sSL https://raw.githubusercontent.com/IronicDeGawd/runway/main/bootstrap.sh | sudo bash -s v0.1.0-beta.1
```

### Method 2: Manual Download

```bash
# Download release
wget https://github.com/IronicDeGawd/runway/releases/download/v0.1.0-beta.1/runway-release-v0.1.0-beta.1.zip

# Extract
unzip runway-release-v0.1.0-beta.1.zip -d /tmp/runway-install

# Run installer
cd /tmp/runway-install
chmod +x install.sh
sudo ./install.sh
```

### Method 3: Using deploy.sh (Development)

```bash
# On your local machine
./deploy.sh --host YOUR_SERVER_IP --key ~/.ssh/your-key.pem

# What it does:
# 1. Builds locally
# 2. Creates production ZIP
# 3. Transfers to server
# 4. Runs install.sh remotely
```

---

## Post-Installation

### Verify Services

```bash
# Check PM2
pm2 status
pm2 logs runway-server --lines 50

# Check Caddy
sudo systemctl status caddy
sudo journalctl -u caddy -n 50

# Check Docker (if installed)
docker ps
```

### Set Admin Credentials

If not prompted during installation:

```bash
cd /opt/runway
node server/scripts/setup-auth.js
```

### Configure Environment

```bash
# Edit environment file (if needed)
nano /opt/runway/data/.env

# Restart services
pm2 restart runway-server
sudo systemctl restart caddy
```

---

## Troubleshooting

### Issue: "No config file to load" (Caddy)

**Cause:** Missing UI dist folder

**Solution:**
```bash
# Check if dist exists
ls -la /opt/runway/ui/dist

# If missing, you need the pre-built package
# Re-run bootstrap or download correct release
```

### Issue: "debian-keyring" package error

**Status:** ✅ Fixed in v0.1.0-beta.1+

**If you see this error:**
```bash
# Manual fix
sudo apt-get install -y apt-transport-https curl
```

### Issue: Line ending errors (^M characters)

**Cause:** Windows CRLF line endings

**Prevention:** .gitattributes now enforces LF

**Fix existing files:**
```bash
# Convert CRLF to LF
dos2unix install.sh
# or
sed -i 's/\r$//' install.sh
```

### Issue: PM2 not found

**Solution:**
```bash
# Source NVM
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Reinstall PM2
npm install -g pm2
```

### Issue: Port 80 already in use

**Solution:**
```bash
# Find what's using port 80
sudo lsof -i :80

# Stop conflicting service (e.g., Apache)
sudo systemctl stop apache2
sudo systemctl disable apache2

# Restart Caddy
sudo systemctl restart caddy
```

### Issue: Dashboard not accessible

**Checklist:**
1. ✅ Is Caddy running? `sudo systemctl status caddy`
2. ✅ Is PM2 running? `pm2 status`
3. ✅ Is port 80 open? `sudo ufw status`
4. ✅ Does ui/dist exist? `ls /opt/runway/ui/dist`
5. ✅ Security group allows port 80?

### Getting Logs

```bash
# PM2 logs
pm2 logs runway-server --lines 100

# Caddy logs
sudo journalctl -u caddy -n 100 -f

# Bootstrap log (EC2)
sudo cat /var/log/runway-bootstrap.log

# System logs
sudo journalctl -xe
```

---

## Updating to New Version

### Method 1: Fresh Install (Recommended)

```bash
# Stop services
pm2 stop runway-server

# Backup data
sudo cp -r /opt/runway/data /opt/runway/data.backup

# Run bootstrap with new version
curl -sSL https://raw.githubusercontent.com/IronicDeGawd/runway/main/bootstrap.sh | sudo bash -s v0.2.0-beta.1

# Restore data if needed
```

### Method 2: Manual Update

```bash
# Download new release
cd /tmp
wget https://github.com/IronicDeGawd/runway/releases/download/v0.2.0-beta.1/runway-release-v0.2.0-beta.1.zip

# Stop services
pm2 stop runway-server

# Backup
sudo cp -r /opt/runway /opt/runway.backup

# Extract over existing
sudo unzip -o runway-release-v0.2.0-beta.1.zip -d /opt/runway

# Reinstall dependencies
cd /opt/runway
sudo -u $USER npm install --omit=dev

# Restart
pm2 restart runway-server
sudo systemctl restart caddy
```

---

## Security Recommendations

### Firewall (UFW)

```bash
# Enable firewall
sudo ufw enable

# Allow necessary ports
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS

# Check status
sudo ufw status
```

### SSL/TLS (Optional but Recommended)

```bash
# Update Caddyfile with your domain
sudo nano /opt/runway/data/caddy/Caddyfile

# Change from :80 to:
yourdomain.com {
    # ... rest of config
}

# Caddy will automatically get SSL certificate
sudo systemctl restart caddy
```

### System Updates

```bash
# Enable automatic security updates
sudo apt-get install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

---

## Architecture Overview

```
                    Internet
                       ↓
                   EC2 Instance
                       ↓
                  Caddy (:80)
                   ↙     ↘
          Static Files   API Proxy
           (ui/dist)    (127.0.0.1:3000)
                            ↓
                    PM2 → Node.js Server
                            ↓
                    ┌───────┴───────┐
                    ↓               ↓
              File System      Docker Services
           (/opt/runway/apps)    (PostgreSQL, Redis)
```

---

## File Structure on Server

```
/opt/runway/
├── server/
│   ├── dist/              # Built backend
│   └── scripts/           # Runtime scripts
├── ui/
│   └── dist/              # Built frontend
├── shared/
│   └── dist/              # Built shared code
├── apps/                  # Deployed user projects
├── data/
│   ├── auth.json          # Admin credentials
│   ├── caddy/
│   │   ├── Caddyfile      # Main Caddy config
│   │   └── sites/         # Per-project Caddy configs
│   └── .env               # Environment variables
├── logs/                  # Application logs
├── temp_uploads/          # Temporary upload directory
├── package.json
├── package-lock.json
└── ecosystem.config.js    # PM2 config
```

---

## Support

### Before Opening an Issue

1. Check logs (PM2, Caddy, system)
2. Verify all services are running
3. Check this troubleshooting guide
4. Review GitHub issues

### Useful Information to Provide

- Runway version
- Operating system and version
- Installation method used
- Relevant log excerpts
- Steps to reproduce

---

## Development vs Production

| Feature | Development (deploy.sh) | Production (GitHub Releases) |
|---------|------------------------|------------------------------|
| Build location | Local machine | Local/CI |
| Transfer method | SCP | HTTP download |
| Versioning | Timestamp | Git tags |
| Rollback | Manual | Download previous release |
| EC2 auto-deploy | ❌ No | ✅ Yes |
| Team sharing | ❌ No | ✅ Yes |

---

**Last Updated:** 2026-01-30
**Minimum Runway Version:** v0.1.0-beta.1
