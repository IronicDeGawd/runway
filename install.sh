#!/bin/bash
set -e

# Runway Installer Script
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

echo -e "${BLUE}Starting Runway Installation...${NC}"

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
# Detect Interactive vs Automated Mode
# ============================================================================
if [ -t 0 ]; then
    INTERACTIVE_MODE=true
    log_info "Running in interactive mode"
else
    INTERACTIVE_MODE=false
    log_info "Running in automated mode (using defaults)"
fi

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
    if [ "$INTERACTIVE_MODE" = true ]; then
        read -p "Continue anyway? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    else
        log_info "Continuing with automated installation..."
    fi
fi

# ============================================================================
# Directory Setup
# ============================================================================
INSTALL_DIR="/opt/runway"
log_info "Creating directory structure at ${INSTALL_DIR}..."
mkdir -p "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR/apps"
mkdir -p "$INSTALL_DIR/data"
mkdir -p "$INSTALL_DIR/logs"
mkdir -p "$INSTALL_DIR/temp_uploads"
chown -R "$REAL_USER:$REAL_USER" "$INSTALL_DIR"

# ============================================================================
# Configure Swap (Prevent OOM)
# ============================================================================
log_info "Checking swap configuration..."
if [ $(swapon --show | wc -l) -le 1 ] && [ ! -f /swapfile ]; then
    log_info "Creating 2GB swap file for build stability..."
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' | tee -a /etc/fstab
    log_success "Swap created and enabled"
else
    log_success "Swap already configured"
fi

# ============================================================================
# Dependency Checks
# ============================================================================
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}                        NODE.JS & NVM INSTALLATION${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
log_info "Checking dependencies..."

if ! su - "$REAL_USER" -c "export NVM_DIR=\"\$HOME/.nvm\" && [ -s \"\$NVM_DIR/nvm.sh\" ] && \. \"\$NVM_DIR/nvm.sh\" && command -v node" &> /dev/null; then
    log_info "Node.js not found. Installing via NVM for $REAL_USER..."
    
    # Install NVM as the real user
    su - "$REAL_USER" -c "curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash"

    # Ensure NVM is available in all shell sessions by adding to .profile
    log_info "Ensuring NVM is available in all shell sessions..."
    NVM_INIT_SCRIPT='export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"'

    if ! grep -q "NVM_DIR" "$REAL_HOME/.profile" 2>/dev/null; then
        su - "$REAL_USER" -c "echo '$NVM_INIT_SCRIPT' >> ~/.profile"
        log_success "NVM initialization added to ~/.profile"
    else
        log_info "NVM already configured in ~/.profile"
    fi

    # Source NVM and install Node LTS
    su - "$REAL_USER" -c "export NVM_DIR=\"\$HOME/.nvm\" && [ -s \"\$NVM_DIR/nvm.sh\" ] && \. \"\$NVM_DIR/nvm.sh\" && nvm install --lts && nvm use --lts"
    
    # Verify installation
    NODE_VERSION=$(su - "$REAL_USER" -c "export NVM_DIR=\"\$HOME/.nvm\" && [ -s \"\$NVM_DIR/nvm.sh\" ] && \. \"\$NVM_DIR/nvm.sh\" && node --version")
    log_success "Node.js installed: $NODE_VERSION"
    
    # Prioritize installing PM2 immediately within NVM context
    log_info "Installing PM2 in NVM environment..."
    su - "$REAL_USER" -c "export NVM_DIR=\"\$HOME/.nvm\" && [ -s \"\$NVM_DIR/nvm.sh\" ] && \. \"\$NVM_DIR/nvm.sh\" && npm install -g pm2"
else
    NODE_VERSION=$(su - "$REAL_USER" -c "export NVM_DIR=\"\$HOME/.nvm\" && [ -s \"\$NVM_DIR/nvm.sh\" ] && \. \"\$NVM_DIR/nvm.sh\" && node --version || node --version")
    log_success "Node.js already installed: $NODE_VERSION"
fi

# PM2 check is now handled within the Node/NVM block or subsequent npm install.
# We verification step here just to be sure.
if ! su - "$REAL_USER" -c "export NVM_DIR=\"\$HOME/.nvm\" && [ -s \"\$NVM_DIR/nvm.sh\" ] && \. \"\$NVM_DIR/nvm.sh\" && command -v pm2" &> /dev/null; then
     log_info "PM2 not found. Installing via NVM..."
     su - "$REAL_USER" -c "export NVM_DIR=\"\$HOME/.nvm\" && [ -s \"\$NVM_DIR/nvm.sh\" ] && \. \"\$NVM_DIR/nvm.sh\" && npm install -g pm2"
fi

if ! command -v caddy &> /dev/null; then
    log_info "Installing Caddy..."
    apt-get install -y -qq apt-transport-https curl
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

# Check for build-essential (make, gcc, g++, etc.)
if ! dpkg -s build-essential &> /dev/null || ! command -v make &> /dev/null || ! command -v gcc &> /dev/null || ! command -v g++ &> /dev/null; then
    log_info "Installing build-essential (make, gcc, g++, etc.)..."
    apt-get install -y build-essential
    log_success "build-essential installed"
else
    log_success "build-essential already installed"
fi


# ============================================================================
# Optional Docker Installation
# ============================================================================
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}                        DOCKER INSTALLATION (OPTIONAL)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if [ "$INTERACTIVE_MODE" = true ]; then
    # Interactive: Ask the user
    if command -v docker &> /dev/null; then
        log_info "Docker is already installed: $(docker --version)"
        read -p "Do you want to reconfigure Docker? (y/n) " -n 1 -r
        echo
    else
        read -p "Docker is not installed. Do you want to install Docker/Docker Compose for managed services? (y/n) " -n 1 -r
        echo
    fi
    INSTALL_DOCKER=$REPLY
else
    # Automated: Use default (install Docker)
    if command -v docker &> /dev/null; then
        log_info "Docker is already installed: $(docker --version)"
        INSTALL_DOCKER="n"
    else
        log_info "Docker not found. Installing automatically (automated mode default)"
        INSTALL_DOCKER="y"
    fi
fi

if [[ $INSTALL_DOCKER =~ ^[Yy]$ ]]; then
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
    fi

    # ALWAYS ensure user is in docker group, regardless of whether we just installed it or it was already there
    if ! groups "$REAL_USER" | grep -q "\bdocker\b"; then
        usermod -aG docker "$REAL_USER"
        log_info "Added $REAL_USER to docker group (log out and back in for this to take effect)"
    else
        log_info "$REAL_USER is already in the docker group"
    fi

    systemctl enable docker
    systemctl start docker

    if systemctl is-active --quiet docker; then
        log_success "Docker service is running"
    else
        log_error "Docker service failed to start"
    fi
else
    log_info "Skipping Docker installation/configuration"
fi

# ============================================================================
# Copy Pre-Built Artifacts
# ============================================================================
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}                        DEPLOYING PRODUCTION ARTIFACTS${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
# We assume the incoming directory structure is ALREADY the production artifact structure.
# So we simply sync everything from current dir to install dir.
log_info "Syncing production artifacts to ${INSTALL_DIR}..."

rsync -a \
    --delete \
    --exclude 'data' \
    --exclude 'node_modules' \
    --exclude 'apps' \
    --exclude 'temp_uploads' \
    --exclude 'logs' \
    . "$INSTALL_DIR/"

chown -R "$REAL_USER:$REAL_USER" "$INSTALL_DIR"
log_success "Artifacts deployed successfully"

# ============================================================================
# Install Production Dependencies (as real user)
# ============================================================================
log_info "Installing production dependencies..."
cd "$INSTALL_DIR"

# NVM Environment Command Wrapper
NVM_EXEC="export NVM_DIR=\"\$HOME/.nvm\" && [ -s \"\$NVM_DIR/nvm.sh\" ] && \. \"\$NVM_DIR/nvm.sh\""

# Install root dependencies (concurrently, shared, etc)
# Using --omit=dev for production only
su - "$REAL_USER" -c "$NVM_EXEC && cd '$INSTALL_DIR' && npm install --omit=dev --loglevel=error"
su - "$REAL_USER" -c "$NVM_EXEC && cd '$INSTALL_DIR' && npm install ./shared --omit=dev --loglevel=error"

# Note: We do NOT run 'npm run build' anymore.


log_success "Project built successfully"

# ============================================================================
# Auth Setup (as real user)
# ============================================================================
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}                        ADMIN CREDENTIALS SETUP${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
log_info "Setting up admin credentials..."
if [ ! -f "$INSTALL_DIR/data/auth.json" ]; then
    if [ "$INTERACTIVE_MODE" = true ]; then
        log_info "Running interactive auth setup..."
        su - "$REAL_USER" -c "$NVM_EXEC && cd '$INSTALL_DIR' && node server/scripts/setup-auth.js"
        log_success "Admin credentials configured"
    else
        # Automated mode: Create default admin/admin credentials
        log_info "Creating default admin credentials (automated mode)"

        # Generate bcrypt hash of "admin" using Node.js and bcryptjs
        cd "$INSTALL_DIR"
        ADMIN_HASH=$(su - "$REAL_USER" -c "$NVM_EXEC && cd '$INSTALL_DIR' && node -e \"const bcrypt = require('bcryptjs'); bcrypt.hash('admin', 10).then(hash => console.log(hash));\"")
        JWT_SECRET=$(openssl rand -hex 64)

        mkdir -p "$INSTALL_DIR/data"
        cat > "$INSTALL_DIR/data/auth.json" << EOF
{
  "username": "admin",
  "passwordHash": "$ADMIN_HASH",
  "jwtSecret": "$JWT_SECRET",
  "mustResetPassword": true
}
EOF
        chown "$REAL_USER:$REAL_USER" "$INSTALL_DIR/data/auth.json"
        chmod 600 "$INSTALL_DIR/data/auth.json"

        log_warning "⚠️  Default credentials: admin / admin"
        log_info "Change password after installation: cd /opt/runway && node server/scripts/setup-auth.js"
        log_success "Admin credentials configured"
    fi
else
    log_info "Auth file already exists."
    if [ "$INTERACTIVE_MODE" = true ]; then
        read -p "Do you want to change the admin password? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            su - "$REAL_USER" -c "$NVM_EXEC && cd '$INSTALL_DIR' && node server/scripts/setup-auth.js"
            log_success "Admin credentials updated"
        else
            log_info "Keeping existing credentials"
        fi
    else
        log_info "Keeping existing credentials (automated mode)"
    fi
fi

# ============================================================================
# PM2 Setup (as real user)
# ============================================================================
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}                        PM2 PROCESS MANAGER SETUP${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
log_info "Starting Control Plane with PM2..."
cd "$INSTALL_DIR"

# Stop existing PM2 process and KILL the daemon to ensure we drop legacy/root paths
su - "$REAL_USER" -c "$NVM_EXEC && pm2 kill && sleep 5"

# Start with PM2 as real user
su - "$REAL_USER" -c "$NVM_EXEC && cd '$INSTALL_DIR' && pm2 start ecosystem.config.js"
su - "$REAL_USER" -c "$NVM_EXEC && pm2 save"

log_success "PM2 process started"

# ============================================================================
# Configure PM2 Startup (NON-INTERACTIVE)
# ============================================================================
log_info "Configuring PM2 to start on boot..."

# Generate and execute PM2 startup script non-interactively
# Generate and execute PM2 startup script non-interactively
# We need to ensure we use the PM2 from NVM
PM2_STARTUP_SCRIPT=$(su - "$REAL_USER" -c "$NVM_EXEC && pm2 startup systemd -u $REAL_USER --hp $REAL_HOME" | grep "^sudo env" || echo "")

if [ -n "$PM2_STARTUP_SCRIPT" ]; then
    # Remove 'sudo' from the command since we're already root
    PM2_STARTUP_SCRIPT_NOSUDO=$(echo "$PM2_STARTUP_SCRIPT" | sed 's/^sudo //')
    
    log_info "Executing PM2 startup configuration..."
    eval "$PM2_STARTUP_SCRIPT_NOSUDO" 2>&1 || {
        log_warning "PM2 startup command failed (may need manual setup)"
        log_info "You can configure it manually later with: pm2 startup systemd"
    }
    
    # Save PM2 process list as the real user
    su - "$REAL_USER" -c "$NVM_EXEC && pm2 save"
    
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
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}                        CADDY WEB SERVER CONFIGURATION${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
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

# Generate Runway-managed blocks with per-block markers
RUNWAY_GLOBAL='# runway:global-start
{
  admin localhost:2019
  auto_https off
}
# runway:global-end'

RUNWAY_MAIN='# runway:main-start
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
    request_body {
      max_size 512MB
    }
    reverse_proxy 127.0.0.1:3000 {
      transport http {
        read_timeout 10m
        write_timeout 10m
      }
    }
  }

  # Deployed projects - Import all site configs
  import /opt/runway/data/caddy/sites/*.caddy

  # Frontend SPA (fallback - must be last)
  handle {
    root * /opt/runway/ui/dist
    try_files {path} /index.html
    file_server
    encode gzip
  }
}
# runway:main-end'

RUNWAY_CUSTOM_IMPORT="# User custom configuration (never overwritten by Runway)
import $CADDY_DATA_DIR/custom.caddy"

RUNWAY_CONFIG="$RUNWAY_GLOBAL

$RUNWAY_MAIN

$RUNWAY_CUSTOM_IMPORT"

# Preserve non-Runway content from existing Caddyfile
EXISTING_CADDYFILE="$CADDY_DATA_DIR/Caddyfile"
PRESERVED=""

if [ -f "$EXISTING_CADDYFILE" ]; then
    log_info "Found existing Caddyfile, preserving non-Runway blocks..."

    # Strip all runway-marked blocks (new per-block format: runway:*-start / runway:*-end)
    PRESERVED=$(sed '/^# runway:.*-start$/,/^# runway:.*-end$/d' "$EXISTING_CADDYFILE")

    # Also strip old-format markers if upgrading from previous version
    PRESERVED=$(echo "$PRESERVED" | sed '/^# BEGIN RUNWAY MANAGED/,/^# END RUNWAY MANAGED/d')

    # Strip the custom.caddy import line (we always re-add it in RUNWAY_CONFIG)
    PRESERVED=$(echo "$PRESERVED" | sed '/^# User custom configuration/d' | sed '/^import.*custom\.caddy$/d')

    # Remove blank-only leftovers
    PRESERVED=$(echo "$PRESERVED" | sed '/^[[:space:]]*$/d')

    if [ -n "$PRESERVED" ]; then
        log_info "Preserving $(echo "$PRESERVED" | wc -l | tr -d ' ') lines of non-Runway config"
    fi
fi

# Write final Caddyfile: Runway blocks first, then preserved user blocks
if [ -n "$PRESERVED" ]; then
    printf '%s\n\n%s\n' "$RUNWAY_CONFIG" "$PRESERVED" > "$CADDY_DATA_DIR/Caddyfile"
    log_success "Caddyfile created with preserved user config at $CADDY_DATA_DIR/Caddyfile"
else
    echo "$RUNWAY_CONFIG" > "$CADDY_DATA_DIR/Caddyfile"
    log_success "Caddyfile created at $CADDY_DATA_DIR/Caddyfile"
fi

chmod 644 "$CADDY_DATA_DIR/Caddyfile"

# Link system Caddyfile to our managed config
log_info "Linking system Caddyfile to our managed configuration..."
rm -f /etc/caddy/Caddyfile
ln -s "$CADDY_DATA_DIR/Caddyfile" /etc/caddy/Caddyfile
log_success "Symlink created: /etc/caddy/Caddyfile -> $CADDY_DATA_DIR/Caddyfile"

# Also symlink sites directory
rm -rf /etc/caddy/sites
ln -s "$CADDY_DATA_DIR/sites" /etc/caddy/sites
log_success "Symlink created: /etc/caddy/sites -> $CADDY_DATA_DIR/sites"

# Create custom.caddy if it doesn't exist (user-managed, never overwritten)
CUSTOM_CADDY="$CADDY_DATA_DIR/custom.caddy"
if [ ! -f "$CUSTOM_CADDY" ]; then
    cat > "$CUSTOM_CADDY" << 'CUSTOMEOF'
# custom.caddy — User-defined Caddy blocks
# This file is never overwritten by Runway updates or redeploys.
# Add your custom Caddy site blocks, snippets, or directives here.
CUSTOMEOF
    chmod 644 "$CUSTOM_CADDY"
    chown "$REAL_USER:$REAL_USER" "$CUSTOM_CADDY"
    log_success "Created custom.caddy for user-defined blocks"
else
    log_info "custom.caddy already exists — preserving user content"
fi

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
SUDOERS_FILE="/etc/sudoers.d/runway-caddy"
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
# Domain Re-verification (if previously configured)
# ============================================================================
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}                        DOMAIN CONFIGURATION CHECK${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Wait for server to be ready
log_info "Waiting for server to be ready..."
sleep 5

# Check if a domain was previously configured and re-verify it
DOMAIN_CHECK=$(curl -s http://127.0.0.1:3000/api/domain 2>/dev/null)
if echo "$DOMAIN_CHECK" | grep -q '"domain"' && ! echo "$DOMAIN_CHECK" | grep -q '"domain":null'; then
    CONFIGURED_DOMAIN=$(echo "$DOMAIN_CHECK" | grep -o '"domain":"[^"]*"' | head -1 | cut -d'"' -f4)
    if [ -n "$CONFIGURED_DOMAIN" ]; then
        log_info "Found previously configured domain: $CONFIGURED_DOMAIN"
        log_info "Re-verifying domain configuration..."

        VERIFY_RESULT=$(curl -s -X POST http://127.0.0.1:3000/api/domain/verify 2>/dev/null)
        if echo "$VERIFY_RESULT" | grep -q '"success":true'; then
            log_success "Domain re-verified and HTTPS configuration restored"
        else
            log_warning "Domain verification failed - HTTPS not active"
            log_info "You can re-verify manually in Settings > Domain Configuration"
        fi
    fi
else
    log_info "No domain configured"
    log_warning "⚠️  Running in HTTP mode (insecure)"
    log_info "Configure a domain in Settings for HTTPS security"
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
su - "$REAL_USER" -c "$NVM_EXEC && pm2 ping" &> /dev/null && echo -e "  PM2: ${GREEN}✓ Running${NC}" || echo -e "  PM2: ${YELLOW}⚠ Not running${NC}"
systemctl is-active --quiet caddy && echo -e "  Caddy: ${GREEN}✓ Running${NC}" || echo -e "  Caddy: ${YELLOW}⚠ Not running${NC}"
echo ""
echo -e "Useful Commands:"
echo -e "  View logs: ${BLUE}pm2 logs${NC}"
echo -e "  Check status: ${BLUE}pm2 status${NC}"
echo -e "  Restart server: ${BLUE}pm2 restart runway-server${NC}"
echo -e "  Caddy logs: ${BLUE}journalctl -u caddy -f${NC}"
echo ""
echo -e "${YELLOW}Important:${NC}"
echo -e "  - Log out and back in for Docker group membership to take effect"
echo -e "  - Admin credentials are stored in: ${BLUE}$INSTALL_DIR/data/auth.json${NC}"
echo ""

# Security warning for automated installations
if [ "$INTERACTIVE_MODE" = false ]; then
    echo ""
    echo -e "${YELLOW}==================================${NC}"
    echo -e "${YELLOW}⚠️  Security Warning${NC}"
    echo -e "${YELLOW}==================================${NC}"
    echo -e "${YELLOW}Default admin credentials were used:${NC}"
    echo -e "  Username: ${RED}admin${NC}"
    echo -e "  Password: ${RED}admin${NC}"
    echo ""
    echo -e "${YELLOW}Change the password immediately:${NC}"
    echo -e "  ${BLUE}cd /opt/runway${NC}"
    echo -e "  ${BLUE}node server/scripts/setup-auth.js${NC}"
    echo ""
fi

# ============================================================================
# Configure UFW firewall (Best effort - don't fail installation if it doesn't work)
# ============================================================================
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}                        FIREWALL CONFIGURATION (UFW)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
if command -v ufw &> /dev/null; then
    log_info "Configuring firewall (UFW)..."

    # Attempt UFW configuration, but don't fail the entire install if it doesn't work
    UFW_SUCCESS=true

    # Check if UFW is active
    if ! ufw status 2>/dev/null | grep -q "Status: active"; then
        # # Allow SSH first to prevent lockout
        # if ! ufw --force allow 22/tcp > /dev/null 2>&1; then
        #     UFW_SUCCESS=false
        # fi

        # Enable UFW (this is what commonly fails on some cloud instances)
        if ! ufw --force enable > /dev/null 2>&1; then
            UFW_SUCCESS=false
        fi
    fi

    # Allow HTTP/HTTPS
    if ! ufw allow 80/tcp > /dev/null 2>&1; then
        UFW_SUCCESS=false
    fi

    if ! ufw allow 443/tcp > /dev/null 2>&1; then
        UFW_SUCCESS=false
    fi

    if [ "$UFW_SUCCESS" = true ]; then
        log_success "Firewall configured"
    else
        log_warning "UFW configuration failed - firewall not enabled"
        log_info "You can manually configure UFW later with:"
        # echo -e "  ${BLUE}sudo ufw allow 22/tcp${NC}"
        echo -e "  ${BLUE}sudo ufw allow 80/tcp${NC}"
        echo -e "  ${BLUE}sudo ufw allow 443/tcp${NC}"
        echo -e "  ${BLUE}sudo ufw --force enable${NC}"
    fi
else
    log_info "UFW not installed, skipping firewall configuration"
fi