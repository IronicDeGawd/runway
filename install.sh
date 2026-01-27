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

# ============================================================================
# CRITICAL: Check if running with sudo
# ============================================================================
if [ "$EUID" -ne 0 ]; then 
    log_error "This script must be run with sudo"
    log_info "Usage: sudo ./install.sh"
    exit 1
fi

# Get the actual user who invoked sudo
REAL_USER="${SUDO_USER:-$USER}"
REAL_HOME=$(getent passwd "$REAL_USER" | cut -d: -f6)

if [ -z "$REAL_USER" ] || [ "$REAL_USER" = "root" ]; then
    log_error "Cannot detect actual user. Do not run as root directly."
    log_info "Usage: sudo ./install.sh (as a normal user with sudo)"
    exit 1
fi

log_info "Running as: $REAL_USER (sudo mode)"

# ============================================================================
# Check if running on supported OS
# ============================================================================
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

# ============================================================================
# Directory Setup
# ============================================================================
INSTALL_DIR="/opt/pdcp"
log_info "Creating directory structure at ${INSTALL_DIR}..."
mkdir -p "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR/apps"
mkdir -p "$INSTALL_DIR/data"
mkdir -p "$INSTALL_DIR/logs"
mkdir -p "$INSTALL_DIR/temp_uploads"
chown -R "$REAL_USER:$REAL_USER" "$INSTALL_DIR"

# ============================================================================
# Dependency Checks
# ============================================================================
log_info "Checking dependencies..."

if ! command -v node &> /dev/null; then
    log_info "Node.js not found. Installing Node 20.x..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
    log_success "Node.js installed: $(node --version)"
else
    log_success "Node.js already installed: $(node --version)"
fi

if ! command -v pm2 &> /dev/null; then
    log_info "Installing PM2..."
    npm install -g pm2
    log_success "PM2 installed: $(pm2 --version)"
else
    log_success "PM2 already installed: $(pm2 --version)"
fi

if ! command -v caddy &> /dev/null; then
    log_info "Installing Caddy..."
    apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
    apt-get update
    apt-get install -y caddy
    log_success "Caddy installed: $(caddy version)"
else
    log_success "Caddy already installed: $(caddy version)"
fi

if ! command -v rsync &> /dev/null; then
    log_info "Installing rsync..."
    apt-get install -y rsync
    log_success "rsync installed"
else
    log_success "rsync already installed"
fi

# ============================================================================
# Optional Docker Installation
# ============================================================================
echo ""
read -p "Do you want to install Docker/Docker Compose for managed services? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if ! command -v docker &> /dev/null; then
        log_info "Installing Docker..."
        apt-get update
        apt-get install -y ca-certificates curl gnupg
        install -m 0755 -d /etc/apt/keyrings
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
        chmod a+r /etc/apt/keyrings/docker.gpg

        . /etc/os-release
        OS=$ID
        VERSION_CODENAME=$VERSION_CODENAME
        
        if [ "$OS" = "debian" ]; then
            DOCKER_DISTRO="debian"
        else
            DOCKER_DISTRO="ubuntu"
        fi
        
        echo \
          "deb [arch=\"$(dpkg --print-architecture)\" signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${DOCKER_DISTRO} \
          ${VERSION_CODENAME} stable" | \
          tee /etc/apt/sources.list.d/docker.list > /dev/null
        
        apt-get update
        apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
        log_success "Docker installed: $(docker --version)"
        
        # Add user to docker group
        usermod -aG docker "$REAL_USER"
        log_info "Added $REAL_USER to docker group (log out and back in for this to take effect)"
    else
        log_success "Docker is already installed: $(docker --version)"
    fi
    
    systemctl enable docker
    systemctl start docker
    
    if systemctl is-active --quiet docker; then
        log_success "Docker service is running"
    else
        log_error "Docker service failed to start"
    fi
else
    log_info "Skipping Docker installation"
fi

# ============================================================================
# Copy Files
# ============================================================================
log_info "Copying application files to ${INSTALL_DIR}..."
rsync -a \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude 'dist' \
    --exclude '.DS_Store' \
    --exclude 'server/dist' \
    --exclude 'ui/dist' \
    --exclude 'shared/dist' \
    . "$INSTALL_DIR/"
chown -R "$REAL_USER:$REAL_USER" "$INSTALL_DIR"
log_success "Files copied successfully"

# ============================================================================
# Build (as real user)
# ============================================================================
log_info "Building project..."
cd "$INSTALL_DIR"
rm -rf node_modules dist server/dist ui/dist shared/dist

# Run npm commands as the real user
su - "$REAL_USER" -c "cd '$INSTALL_DIR' && npm install --loglevel=error"
su - "$REAL_USER" -c "cd '$INSTALL_DIR' && npm install ./shared --loglevel=error"
su - "$REAL_USER" -c "cd '$INSTALL_DIR' && npm run build"

log_success "Project built successfully"

# ============================================================================
# Auth Setup (as real user)
# ============================================================================
log_info "Setting up admin credentials..."
if [ ! -f "$INSTALL_DIR/data/auth.json" ]; then
    log_info "Running interactive auth setup..."
    su - "$REAL_USER" -c "cd '$INSTALL_DIR' && node server/scripts/setup-auth.js"
    log_success "Admin credentials configured"
else
    log_info "Auth file already exists."
    read -p "Do you want to change the admin password? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        su - "$REAL_USER" -c "cd '$INSTALL_DIR' && node server/scripts/setup-auth.js"
        log_success "Admin credentials updated"
    else
        log_info "Keeping existing credentials"
    fi
fi

# ============================================================================
# PM2 Setup (as real user)
# ============================================================================
log_info "Starting Control Plane with PM2..."
cd "$INSTALL_DIR"

# Stop existing PM2 process if any
su - "$REAL_USER" -c "pm2 delete pdcp-server 2>/dev/null || true"

# Start with PM2 as real user
su - "$REAL_USER" -c "cd '$INSTALL_DIR' && pm2 start ecosystem.config.js"
su - "$REAL_USER" -c "pm2 save"

log_success "PM2 process started"

# ============================================================================
# Configure PM2 Startup (NON-INTERACTIVE)
# ============================================================================
log_info "Configuring PM2 to start on boot..."

# Generate and execute PM2 startup script non-interactively
PM2_STARTUP_SCRIPT=$(su - "$REAL_USER" -c "pm2 startup systemd -u $REAL_USER --hp $REAL_HOME" | grep "^sudo env" || echo "")

if [ -n "$PM2_STARTUP_SCRIPT" ]; then
    # Remove 'sudo' from the command since we're already root
    PM2_STARTUP_SCRIPT_NOSUDO=$(echo "$PM2_STARTUP_SCRIPT" | sed 's/^sudo //')
    
    log_info "Executing PM2 startup configuration..."
    eval "$PM2_STARTUP_SCRIPT_NOSUDO" 2>&1 || {
        log_warning "PM2 startup command failed (may need manual setup)"
        log_info "You can configure it manually later with: pm2 startup systemd"
    }
    
    # Save PM2 process list as the real user
    su - "$REAL_USER" -c "pm2 save"
    
    sleep 1
    
    if systemctl is-enabled "pm2-$REAL_USER" >/dev/null 2>&1; then
        log_success "PM2 systemd service enabled"
    else
        log_warning "PM2 systemd service not enabled"
        log_info "Run manually: pm2 startup systemd"
    fi
else
    log_warning "Could not get PM2 startup command"
    log_info "Configure manually with: pm2 startup systemd"
fi

# ============================================================================
# Caddy Setup
# ============================================================================
log_info "Configuring Caddy reverse proxy..."

# Backup existing Caddyfile if it exists
if [ -f "/etc/caddy/Caddyfile" ]; then
    log_warning "Existing Caddyfile found at /etc/caddy/Caddyfile"
    BACKUP_FILE="/etc/caddy/Caddyfile.backup.$(date +%Y%m%d_%H%M%S)"
    cp /etc/caddy/Caddyfile "$BACKUP_FILE"
    log_info "Backed up to: $BACKUP_FILE"
fi

# Create Caddy config directory structure
mkdir -p /etc/caddy/sites
CADDY_DATA_DIR="$INSTALL_DIR/data/caddy"
mkdir -p "$CADDY_DATA_DIR/sites"
chown -R "$REAL_USER:$REAL_USER" "$CADDY_DATA_DIR"

log_info "Generating main Caddyfile with WebSocket support..."
cat > "$CADDY_DATA_DIR/Caddyfile" << 'EOF'
{
  admin off
  auto_https off
}

:80 {
  # WebSocket endpoints - MUST be before wildcard routes
  @websocket_realtime {
    path /api/realtime*
  }
  handle @websocket_realtime {
    reverse_proxy 127.0.0.1:3000 {
      header_up Upgrade {http.request.header.Upgrade}
      header_up Connection {http.request.header.Connection}
    }
  }
  
  @websocket_logs {
    path /api/logs*
  }
  handle @websocket_logs {
    reverse_proxy 127.0.0.1:3000 {
      header_up Upgrade {http.request.header.Upgrade}
      header_up Connection {http.request.header.Connection}
    }
  }
  
  # Regular API routes
  handle /api/* {
    reverse_proxy 127.0.0.1:3000 {
      transport http {
        read_timeout 5m
        write_timeout 5m
      }
    }
  }
  
  # Frontend SPA
  handle {
    root * /opt/pdcp/ui/dist
    try_files {path} /index.html
    file_server
    encode gzip
  }
}
EOF

chmod 644 "$CADDY_DATA_DIR/Caddyfile"
log_success "Main Caddyfile created at $CADDY_DATA_DIR/Caddyfile"

# Link system Caddyfile to our managed config
log_info "Linking system Caddyfile to our managed configuration..."
rm -f /etc/caddy/Caddyfile
ln -s "$CADDY_DATA_DIR/Caddyfile" /etc/caddy/Caddyfile
log_success "Symlink created: /etc/caddy/Caddyfile -> $CADDY_DATA_DIR/Caddyfile"

# Also symlink sites directory
rm -rf /etc/caddy/sites
ln -s "$CADDY_DATA_DIR/sites" /etc/caddy/sites
log_success "Symlink created: /etc/caddy/sites -> $CADDY_DATA_DIR/sites"

# Validate Caddy configuration
log_info "Validating Caddy configuration..."
if caddy validate --config /etc/caddy/Caddyfile 2>/dev/null; then
    log_success "Caddy configuration is valid"
else
    log_error "Caddy configuration validation failed"
    log_info "Check the config at: $CADDY_DATA_DIR/Caddyfile"
    caddy validate --config /etc/caddy/Caddyfile
fi

# Reload Caddy configuration
systemctl enable caddy
systemctl restart caddy

# Verify Caddy is running
sleep 2
if systemctl is-active --quiet caddy; then
    log_success "Caddy is running"
else
    log_warning "Caddy failed to start"
    echo -e "  Check logs: ${BLUE}journalctl -u caddy -n 50${NC}"
fi

# ============================================================================
# Grant Node.js permission to manage Caddy
# ============================================================================
log_info "Configuring sudoers for Caddy management..."
SUDOERS_FILE="/etc/sudoers.d/pdcp-caddy"
cat > "$SUDOERS_FILE" << EOF
$REAL_USER ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart caddy
$REAL_USER ALL=(ALL) NOPASSWD: /usr/bin/systemctl reload caddy
$REAL_USER ALL=(ALL) NOPASSWD: /usr/bin/systemctl status caddy
$REAL_USER ALL=(ALL) NOPASSWD: /usr/bin/caddy reload --config *
$REAL_USER ALL=(ALL) NOPASSWD: /usr/bin/caddy validate --config *
EOF
chmod 0440 "$SUDOERS_FILE"
log_success "Caddy sudoers configured"

# ============================================================================
# Configure UFW firewall if present
# ============================================================================
if command -v ufw &> /dev/null; then
    log_info "Configuring firewall (UFW)..."
    
    # Check if UFW is active
    if ! ufw status | grep -q "Status: active"; then
        # Allow SSH first to prevent lockout
        ufw --force allow 22/tcp > /dev/null 2>&1
        ufw --force enable
    fi
    
    # Allow HTTP for dashboard
    ufw allow 80/tcp > /dev/null 2>&1
    
    # Optionally allow HTTPS for future
    ufw allow 443/tcp > /dev/null 2>&1
    
    log_success "Firewall configured (ports 22, 80, 443 open)"
else
    log_info "UFW not installed, skipping firewall configuration"
    log_warning "Ensure your cloud provider security group allows port 80"
fi

# ============================================================================
# Final Status
# ============================================================================
echo ""
echo -e "${GREEN}==================================${NC}"
echo -e "${GREEN}Installation Complete!${NC}"
echo -e "${GREEN}==================================${NC}"
echo ""
echo -e "Dashboard: ${BLUE}http://$(hostname -I | awk '{print $1}')/${NC}"
echo ""
echo -e "Services Status:"
systemctl is-active --quiet "pm2-$REAL_USER" && echo -e "  PM2: ${GREEN}✓ Running${NC}" || echo -e "  PM2: ${YELLOW}⚠ Not running${NC}"
systemctl is-active --quiet caddy && echo -e "  Caddy: ${GREEN}✓ Running${NC}" || echo -e "  Caddy: ${YELLOW}⚠ Not running${NC}"
echo ""
echo -e "Useful Commands:"
echo -e "  View logs: ${BLUE}pm2 logs${NC}"
echo -e "  Check status: ${BLUE}pm2 status${NC}"
echo -e "  Restart server: ${BLUE}pm2 restart pdcp-server${NC}"
echo -e "  Caddy logs: ${BLUE}journalctl -u caddy -f${NC}"
echo ""
echo -e "${YELLOW}Important:${NC}"
echo -e "  - Log out and back in for Docker group membership to take effect"
echo -e "  - Admin credentials are stored in: ${BLUE}$INSTALL_DIR/data/auth.json${NC}"
echo ""