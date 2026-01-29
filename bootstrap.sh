#!/bin/bash
set -e

# Runway Bootstrap Script
# Downloads the latest release from GitHub and runs the installer
# Usage: curl -sSL https://raw.githubusercontent.com/USER/REPO/main/bootstrap.sh | sudo bash

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# ============================================================================
# Configuration
# ============================================================================

# GitHub repository (CHANGE THIS TO YOUR REPO)
GITHUB_REPO="${GITHUB_REPO:-IronicDeGawd/runway}"

# Version to install (latest if not specified)
VERSION="${1:-latest}"

# Installation directory
INSTALL_DIR="/opt/runway"
TEMP_DIR="/tmp/runway-install-$$"

echo ""
echo "=========================================="
echo "  Runway Bootstrap Installer"
echo "=========================================="
echo "Repository: ${GITHUB_REPO}"
echo "Version: ${VERSION}"
echo "=========================================="
echo ""

# ============================================================================
# Check if running as root
# ============================================================================
if [ "$EUID" -ne 0 ]; then
    log_error "This script must be run with sudo"
    log_info "Usage: sudo bash bootstrap.sh [version]"
    log_info "Example: sudo bash bootstrap.sh v0.1.0-beta.1"
    log_info "Example: sudo bash bootstrap.sh  # (installs latest)"
    exit 1
fi

# ============================================================================
# Check prerequisites
# ============================================================================
log_info "Checking prerequisites..."

if ! command -v curl &> /dev/null; then
    log_error "curl is required but not installed"
    log_info "Install it with: apt-get update && apt-get install -y curl"
    exit 1
fi

if ! command -v unzip &> /dev/null; then
    log_info "Installing unzip..."
    apt-get update > /dev/null 2>&1
    apt-get install -y unzip > /dev/null 2>&1
    log_success "unzip installed"
fi

if ! command -v jq &> /dev/null; then
    log_info "Installing jq..."
    apt-get install -y jq > /dev/null 2>&1
    log_success "jq installed"
fi

# ============================================================================
# Get download URL
# ============================================================================
log_info "Fetching release information..."

if [ "$VERSION" = "latest" ]; then
    # Get latest release
    API_URL="https://api.github.com/repos/${GITHUB_REPO}/releases/latest"
    RELEASE_DATA=$(curl -sSL "$API_URL")

    if echo "$RELEASE_DATA" | jq -e '.message' > /dev/null 2>&1; then
        ERROR_MSG=$(echo "$RELEASE_DATA" | jq -r '.message')
        log_error "Failed to fetch release: $ERROR_MSG"
        exit 1
    fi

    VERSION=$(echo "$RELEASE_DATA" | jq -r '.tag_name')
    DOWNLOAD_URL=$(echo "$RELEASE_DATA" | jq -r '.assets[] | select(.name | endswith(".zip")) | .browser_download_url' | head -1)
else
    # Get specific version
    API_URL="https://api.github.com/repos/${GITHUB_REPO}/releases/tags/${VERSION}"
    RELEASE_DATA=$(curl -sSL "$API_URL")

    if echo "$RELEASE_DATA" | jq -e '.message' > /dev/null 2>&1; then
        log_error "Release not found: $VERSION"
        log_info "Check available releases at: https://github.com/${GITHUB_REPO}/releases"
        exit 1
    fi

    DOWNLOAD_URL=$(echo "$RELEASE_DATA" | jq -r '.assets[] | select(.name | endswith(".zip")) | .browser_download_url' | head -1)
fi

if [ -z "$DOWNLOAD_URL" ] || [ "$DOWNLOAD_URL" = "null" ]; then
    log_error "Could not find release package for version: $VERSION"
    exit 1
fi

log_success "Found release: $VERSION"
echo "Download URL: $DOWNLOAD_URL"

# ============================================================================
# Download release
# ============================================================================
log_info "Downloading release package..."

mkdir -p "$TEMP_DIR"
cd "$TEMP_DIR"

ZIP_FILE="runway-release.zip"

if ! curl -L -o "$ZIP_FILE" "$DOWNLOAD_URL"; then
    log_error "Failed to download release"
    rm -rf "$TEMP_DIR"
    exit 1
fi

ZIP_SIZE=$(du -h "$ZIP_FILE" | cut -f1)
log_success "Downloaded: $ZIP_SIZE"

# ============================================================================
# Verify and extract
# ============================================================================
log_info "Extracting package..."

if ! unzip -q "$ZIP_FILE"; then
    log_error "Failed to extract package"
    rm -rf "$TEMP_DIR"
    exit 1
fi

# Verify critical files exist
if [ ! -f "install.sh" ]; then
    log_error "Invalid package: install.sh not found"
    rm -rf "$TEMP_DIR"
    exit 1
fi

if [ ! -d "ui/dist" ] || [ ! -d "server/dist" ]; then
    log_error "Invalid package: missing dist directories"
    rm -rf "$TEMP_DIR"
    exit 1
fi

log_success "Package extracted successfully"

# ============================================================================
# Run installer
# ============================================================================
log_info "Running installer..."
echo ""

chmod +x install.sh

if ! bash install.sh; then
    log_error "Installation failed"
    rm -rf "$TEMP_DIR"
    exit 1
fi

# ============================================================================
# Cleanup
# ============================================================================
log_info "Cleaning up temporary files..."
cd /
rm -rf "$TEMP_DIR"

echo ""
echo -e "${GREEN}==================================${NC}"
echo -e "${GREEN}Bootstrap Complete!${NC}"
echo -e "${GREEN}==================================${NC}"
echo ""
echo -e "Installed version: ${BLUE}${VERSION}${NC}"
echo -e "Installation directory: ${BLUE}${INSTALL_DIR}${NC}"
echo ""
echo -e "Dashboard: ${BLUE}http://$(hostname -I | awk '{print $1}')/${NC}"
echo ""
