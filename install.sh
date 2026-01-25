#!/bin/bash
set -e

# PDCP Installer Script

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}Starting PDCP Installation...${NC}"

# Check for root
if [ "$EUID" -ne 0 ]
  then echo "Please run as root"
  exit
fi

# Directory Setup
INSTALL_DIR="/opt/pdcp"
echo -e "${BLUE}Creating directory structure at ${INSTALL_DIR}...${NC}"
mkdir -p "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR/apps"
mkdir -p "$INSTALL_DIR/data"
mkdir -p "$INSTALL_DIR/logs"

# Dependency Checks
if ! command -v node &> /dev/null
then
    echo "Node.js could not be found. Installing Node 20.x..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

if ! command -v pm2 &> /dev/null
then
    echo "Installing PM2..."
    npm install -g pm2
fi

if ! command -v caddy &> /dev/null
then
    echo "Installing Caddy..."
    apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
    apt-get update
    apt-get install -y caddy rsync
fi

if ! command -v rsync &> /dev/null
then
    echo "Installing rsync..."
    apt-get install -y rsync
fi


# Optional Docker Installation
read -p "Do you want to install Docker/Docker Compose for managed services? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if ! command -v docker &> /dev/null
    then
        echo "Installing Docker..."
        # Add Docker's official GPG key:
        apt-get update
        apt-get install -y ca-certificates curl gnupg
        install -m 0755 -d /etc/apt/keyrings
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
        chmod a+r /etc/apt/keyrings/docker.gpg

        # Add the repository to Apt sources:
        # Note: Using generic logic or assuming Ubuntu/Debian compatibility from lsb_release
        echo \
          "deb [arch=\"$(dpkg --print-architecture)\" signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
          $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
          tee /etc/apt/sources.list.d/docker.list > /dev/null
        
        apt-get update
        apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    else
        echo "Docker is already installed."
    fi
    
    # Enable Docker service
    systemctl enable docker
    systemctl start docker
fi

# Copy Files (Assuming script runs from repo root)
echo -e "${BLUE}Copying application files...${NC}"
# Exclude artifacts to ensure clean install
rsync -a \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude 'dist' \
    --exclude '.DS_Store' \
    . "$INSTALL_DIR/"

# Build
echo -e "${BLUE}Building project...${NC}"
cd "$INSTALL_DIR"
# Clean potential artifacts that slipped through (if cp was used in fallback, though we use rsync now)
rm -rf node_modules dist
npm install
npm run build

# Auth Setup
echo -e "${BLUE}Setup Admin Credentials${NC}"
# We'll generate a random password if one isn't provided, or prompt.
# For now, let's just ensure auth.json exists or let the app handle it.
# Actually, the app reads data/auth.json. We should prompt or init.
if [ ! -f "$INSTALL_DIR/data/auth.json" ]; then
    echo "Creating default admin credentials..."
    node "$INSTALL_DIR/server/scripts/setup-auth.js"
fi

# PM2 Setup
echo -e "${BLUE}Starting Control Plane...${NC}"
pm2 start ecosystem.config.js
pm2 save
pm2 startup | tail -n 1 | bash 2>/dev/null || true

echo -e "${BLUE}Verifying PM2 systemd service...${NC}"
sleep 2

if systemctl is-enabled pm2-root >/dev/null 2>&1; then
    echo -e "${GREEN}✓ PM2 systemd service enabled${NC}"
else
    echo -e "${YELLOW}⚠ Warning: PM2 systemd service not auto-configured${NC}"
    echo -e "${YELLOW}  Run manually: pm2 startup${NC}"
fi

# Caddy Setup
echo -e "${BLUE}Configuring Caddy...${NC}"

# Get UI dist path
UI_DIST="$INSTALL_DIR/ui/dist"

echo -e "${BLUE}Generating initial Caddyfile...${NC}"
cat > "$INSTALL_DIR/data/Caddyfile" << EOF
{
    admin off
}

# Control Plane UI
:80 {
    root * $UI_DIST
    file_server
    try_files {path} /index.html

    handle /api/* {
        reverse_proxy 127.0.0.1:3000
    }
    
    handle /socket.io/* {
        reverse_proxy 127.0.0.1:3000
    }
}
EOF

chmod 644 "$INSTALL_DIR/data/Caddyfile"

systemctl enable caddy
systemctl start caddy

echo -e "${GREEN}Installation Complete!${NC}"
echo -e "Access your dashboard at http://<your-ip>/"
