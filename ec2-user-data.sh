#!/bin/bash
# EC2 User Data Script for Runway Auto-Installation
# This script runs automatically when the EC2 instance first starts

# CONFIGURATION - UPDATE THESE VALUES
GITHUB_REPO="IronicDeGawd/runway"
VERSION="latest"  # or specific version like "v0.1.0-beta.1"

# Redirect output to log file
exec > >(tee /var/log/runway-bootstrap.log)
exec 2>&1

echo "=========================================="
echo "Runway EC2 Bootstrap Started"
echo "Time: $(date)"
echo "=========================================="

# Update system packages
echo "[$(date)] Updating system packages..."
apt-get update -y

# Install prerequisites
echo "[$(date)] Installing prerequisites..."
apt-get install -y curl unzip jq

# Download and run bootstrap script
echo "[$(date)] Downloading bootstrap script..."
export GITHUB_REPO="$GITHUB_REPO"

curl -sSL "https://raw.githubusercontent.com/${GITHUB_REPO}/main/bootstrap.sh" -o /tmp/bootstrap.sh
chmod +x /tmp/bootstrap.sh

echo "[$(date)] Running bootstrap installer..."
bash /tmp/bootstrap.sh "$VERSION"

# Check if installation succeeded
if [ $? -eq 0 ]; then
    echo "=========================================="
    echo "Runway Installation Completed Successfully"
    echo "Time: $(date)"
    echo "=========================================="
else
    echo "=========================================="
    echo "Runway Installation Failed"
    echo "Check logs: /var/log/runway-bootstrap.log"
    echo "=========================================="
    exit 1
fi

# Optional: Configure additional settings
# Uncomment and modify as needed

# # Open firewall ports
# ufw allow 22/tcp
# ufw allow 80/tcp
# ufw allow 443/tcp
# ufw --force enable

# # Set timezone
# timedatectl set-timezone UTC

# # Configure automatic security updates
# apt-get install -y unattended-upgrades
# dpkg-reconfigure -plow unattended-upgrades
