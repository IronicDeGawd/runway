#!/bin/bash
set -e

# PDCP Installer Script
# Exit on error, undefined variables, and pipe failures
set -euo pipefail

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

echo -e "${BLUE}Starting PDCP Installation...${NC}"

# Check if running on supported OS
if [ ! -f /etc/os-release ]; then
    log_error "Cannot detect OS. This script supports Ubuntu/Debian only."
    exit 1
fi

. /etc/os-release
if [[ ! "$ID" =~ ^(ubuntu|debian)$ ]]; then
    log_warning "Detected OS: $ID. This script is tested on Ubuntu/Debian."
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Directory Setup
INSTALL_DIR="/opt/pdcp"
log_info "Creating directory structure at ${INSTALL_DIR}..."
sudo mkdir -p "$INSTALL_DIR"
sudo mkdir -p "$INSTALL_DIR/apps"
sudo mkdir -p "$INSTALL_DIR/data"
sudo mkdir -p "$INSTALL_DIR/logs"
sudo mkdir -p "$INSTALL_DIR/temp_uploads"
sudo chown -R $USER:$USER "$INSTALL_DIR"

# Dependency Checks
log_info "Checking dependencies..."

if ! command -v node &> /dev/null; then
    log_info "Node.js not found. Installing Node 20.x..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
    sudo apt-get install -y nodejs
    log_success "Node.js installed: $(node --version)"
else
    log_success "Node.js already installed: $(node --version)"
fi

if ! command -v pm2 &> /dev/null; then
    log_info "Installing PM2..."
    sudo npm install -g pm2
    log_success "PM2 installed: $(pm2 --version)"
else
    log_success "PM2 already installed: $(pm2 --version)"
fi

if ! command -v caddy &> /dev/null; then
    log_info "Installing Caddy..."
    sudo apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
    sudo apt-get update
    sudo apt-get install -y caddy
    log_success "Caddy installed: $(caddy version)"
else
    log_success "Caddy already installed: $(caddy version)"
fi

if ! command -v rsync &> /dev/null; then
    log_info "Installing rsync..."
    sudo apt-get install -y rsync
    log_success "rsync installed"
else
    log_success "rsync already installed"
fi


# Optional Docker Installation
echo ""
read -p "Do you want to install Docker/Docker Compose for managed services? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if ! command -v docker &> /dev/null; then
        log_info "Installing Docker..."
        # Add Docker's official GPG key:
        sudo apt-get update
        sudo apt-get install -y ca-certificates curl gnupg
        sudo install -m 0755 -d /etc/apt/keyrings
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
        sudo chmod a+r /etc/apt/keyrings/docker.gpg

        # Add the repository to Apt sources:
        # Detect distribution
        if [ -f /etc/os-release ]; then
            . /etc/os-release
            OS=$ID
            VERSION_CODENAME=$VERSION_CODENAME
        else
            log_warning "Cannot detect OS. Assuming Ubuntu..."
            OS="ubuntu"
            VERSION_CODENAME=$(lsb_release -cs)
        fi
        
        # Use ubuntu for debian-based distros
        if [ "$OS" = "debian" ]; then
            DOCKER_DISTRO="debian"
        else
            DOCKER_DISTRO="ubuntu"
        fi
        
        echo \
          "deb [arch=\"$(dpkg --print-architecture)\" signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${DOCKER_DISTRO} \
          ${VERSION_CODENAME} stable" | \
          sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
        
        sudo apt-get update
        sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
        log_success "Docker installed: $(docker --version)"
        
        # Add current user to docker group
        sudo usermod -aG docker $USER
        log_info "Added $USER to docker group (log out and back in for this to take effect)"
    else
        log_success "Docker is already installed: $(docker --version)"
    fi
    
    # Enable Docker service
    sudo systemctl enable docker
    sudo systemctl start docker
    
    # Verify Docker is running
    if sudo systemctl is-active --quiet docker; then
        log_success "Docker service is running"
    else
        log_error "Docker service failed to start"
    fi
else
    log_info "Skipping Docker installation"
fi

# Copy Files (Assuming script runs from repo root)
log_info "Copying application files to ${INSTALL_DIR}..."
# Exclude artifacts to ensure clean install
rsync -a \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude 'dist' \
    --exclude '.DS_Store' \
    --exclude 'server/dist' \
    --exclude 'ui/dist' \
    --exclude 'shared/dist' \
    . "$INSTALL_DIR/"
log_success "Files copied successfully"

# Build
log_info "Building project..."
cd "$INSTALL_DIR"
# Clean and install dependencies
rm -rf node_modules dist server/dist ui/dist shared/dist
npm install --loglevel=error
npm run build
log_success "Project built successfully"

# Auth Setup
log_info "Setting up admin credentials..."
if [ ! -f "$INSTALL_DIR/data/auth.json" ]; then
    log_info "Running interactive auth setup..."
    node "$INSTALL_DIR/server/scripts/setup-auth.js"
    log_success "Admin credentials configured"
else
    log_info "Auth file already exists."
    read -p "Do you want to change the admin password? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        node "$INSTALL_DIR/server/scripts/setup-auth.js"
        log_success "Admin credentials updated"
    else
        log_info "Keeping existing credentials"
    fi
fi

# PM2 Setup
log_info "Starting Control Plane with PM2..."
cd "$INSTALL_DIR"
pm2 delete pdcp-server 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save
log_success "PM2 process started"

# Configure PM2 startup
log_info "Configuring PM2 to start on boot..."
STARTUP_CMD=$(pm2 startup systemd -u $USER --hp $HOME | grep "sudo")
if [ -n "$STARTUP_CMD" ]; then
    eval "$STARTUP_CMD"
    pm2 save
    log_success "PM2 startup configured"
else
    log_warning "Could not configure PM2 startup automatically"
fi

sleep 2

if systemctl is-enabled pm2-$USER >/dev/null 2>&1; then
    log_success "PM2 systemd service enabled"
else
    log_warning "PM2 systemd service not auto-configured"
    echo -e "  Run manually: ${BLUE}pm2 startup systemd${NC}"
fi

# Caddy Setup
log_info "Configuring Caddy reverse proxy..."

# Get UI dist path
UI_DIST="$INSTALL_DIR/ui/dist"

log_info "Generating Caddyfile..."
cat > "$INSTALL_DIR/data/Caddyfile" << 'EOF'
# Control Plane UI
:80 {
    # 1. API: High Priority, Explicit Terminal
    handle /api/* {
        reverse_proxy 127.0.0.1:3000
    }
    
    handle /socket.io/* {
        reverse_proxy 127.0.0.1:3000
    }

    # 2. Frontend: Catch-all Fallback
    handle {
        root * /opt/pdcp/ui/dist
        try_files {path} /index.html
        file_server
    }
}
EOF

chmod 644 "$INSTALL_DIR/data/Caddyfile"
log_success "Caddyfile created"

# Configure Caddy to use our Caddyfile
log_info "Setting up Caddy service..."
sudo mkdir -p /etc/caddy
cat <<'EOF' | sudo tee /etc/caddy/Caddyfile > /dev/null
import /opt/pdcp/data/Caddyfile
EOF

# Reload Caddy configuration
sudo systemctl enable caddy
sudo systemctl restart caddy

# Verify Caddy is running
sleep 2
if sudo systemctl is-active --quiet caddy; then
    log_success "Caddy is running"
else
    log_warning "Caddy failed to start"
    echo -e "  Check logs: ${BLUE}journalctl -u caddy -n 50${NC}"
fi

# Configure UFW firewall if present
if command -v ufw &> /dev/null; then
    log_info "Configuring firewall (UFW)..."
    
    # Enable UFW if not already enabled (with SSH allowed first)
    if ! sudo ufw status | grep -q "Status: active"; then
        sudo ufw --force enable
    fi
    
    # Allow SSH (prevent lockout)
    sudo ufw allow 22/tcp > /dev/null 2>&1
    
    # Allow HTTP for dashboard
    sudo ufw allow 80/tcp > /dev/null 2>&1
    
    # Optionally allow HTTPS for future
    ufw allow 443/tcp > /dev/null 2>&1
    
    log_success "Firewall configured (ports 22, 80, 443 open)"
else
    log_info "UFW not installed, skipping firewall configuration"
    log_warning "Ensure your cloud provider security group allows port 80"
fi

echo -e "${GREEN}Installation Complete!${NC}"
echo ""
echo -e "${GREEN}=== PDCP Control Plane Installed ===${NC}"
echo -e "Dashboard: ${BLUE}http://$(hostname -I | awk '{print $1}')/${NC}"
echo ""
echo -e "Services Status:"
systemctl is-active --quiet pm2-root && echo -e "  PM2: ${GREEN}✓ Running${NC}" || echo -e "  PM2: ${YELLOW}⚠ Not running${NC}"
systemctl is-active --quiet caddy && echo -e "  Caddy: ${GREEN}✓ Running${NC}" || echo -e "  Caddy: ${YELLOW}⚠ Not running${NC}"
echo ""
echo -e "Useful Commands:"
echo -e "  View logs: ${BLUE}pm2 logs${NC}"
echo -e "  Check status: ${BLUE}pm2 status${NC}"
echo -e "  Restart server: ${BLUE}pm2 restart pdcp-server${NC}"
echo -e "  Caddy logs: ${BLUE}journalctl -u caddy -f${NC}"
echo ""
