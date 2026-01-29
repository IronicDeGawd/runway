#!/bin/bash
set -e

# Runway Release Preparation Script
# Builds the project and creates a production-ready release package

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

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Get version from argument or use default
VERSION="${1:-}"
if [ -z "$VERSION" ]; then
    log_error "Version argument required"
    echo "Usage: $0 <version>"
    echo "Example: $0 v0.1.0-beta.1"
    exit 1
fi

# Validate version format
if [[ ! "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-beta\.[0-9]+)?$ ]]; then
    log_error "Invalid version format. Use: v0.1.0-beta.1"
    exit 1
fi

echo ""
echo "=========================================="
echo "  Runway Release Preparation"
echo "=========================================="
echo "Version: ${VERSION}"
echo "=========================================="
echo ""

# Step 1: Clean previous builds
log_info "Cleaning previous builds..."
rm -rf server/dist ui/dist shared/dist
rm -rf node_modules server/node_modules ui/node_modules shared/node_modules
log_success "Clean complete"

# Step 2: Install dependencies
log_info "Installing dependencies..."
npm install
log_success "Dependencies installed"

# Step 3: Build all workspaces
log_info "Building project..."
npm run build
log_success "Build complete"

# Step 4: Verify builds exist
log_info "Verifying builds..."
if [ ! -d "server/dist" ]; then
    log_error "server/dist not found"
    exit 1
fi
if [ ! -d "ui/dist" ]; then
    log_error "ui/dist not found"
    exit 1
fi
if [ ! -d "shared/dist" ]; then
    log_error "shared/dist not found"
    exit 1
fi
log_success "All builds verified"

# Step 5: Create release directory
RELEASE_DIR="releases"
mkdir -p "$RELEASE_DIR"

# Step 6: Create production package
ZIP_NAME="runway-release-${VERSION}.zip"
ZIP_PATH="${RELEASE_DIR}/${ZIP_NAME}"

log_info "Creating release package: ${ZIP_NAME}"

# Remove old package if exists
rm -f "$ZIP_PATH"

# Create zip with production artifacts only
zip -r "$ZIP_PATH" \
    server/dist \
    ui/dist \
    shared/dist \
    shared/package.json \
    server/scripts \
    server/package.json \
    package.json \
    package-lock.json \
    ecosystem.config.js \
    install.sh \
    -x "*.DS_Store" \
    > /dev/null

ZIP_SIZE=$(du -h "$ZIP_PATH" | cut -f1)
log_success "Release package created: ${ZIP_NAME} (${ZIP_SIZE})"

# Step 7: Create checksum
log_info "Generating SHA256 checksum..."
if command -v sha256sum &> /dev/null; then
    sha256sum "$ZIP_PATH" > "${ZIP_PATH}.sha256"
elif command -v shasum &> /dev/null; then
    shasum -a 256 "$ZIP_PATH" > "${ZIP_PATH}.sha256"
else
    log_warning "SHA256 tool not found, skipping checksum"
fi
log_success "Checksum created"

# Step 8: Summary
echo ""
echo -e "${GREEN}==================================${NC}"
echo -e "${GREEN}Release Package Ready!${NC}"
echo -e "${GREEN}==================================${NC}"
echo ""
echo -e "Package: ${BLUE}${ZIP_PATH}${NC}"
echo -e "Size: ${BLUE}${ZIP_SIZE}${NC}"
echo -e "Checksum: ${BLUE}${ZIP_PATH}.sha256${NC}"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo -e "1. Test the package locally:"
echo -e "   ${BLUE}unzip -l ${ZIP_PATH}${NC}"
echo -e ""
echo -e "2. Create a Git tag:"
echo -e "   ${BLUE}git tag ${VERSION}${NC}"
echo -e "   ${BLUE}git push origin ${VERSION}${NC}"
echo -e ""
echo -e "3. Create GitHub Release:"
echo -e "   - Go to: https://github.com/IronicDeGawd/runway/releases/new"
echo -e "   - Tag: ${VERSION}"
echo -e "   - Upload: ${ZIP_PATH}"
echo -e "   - Mark as pre-release if beta"
echo -e ""
