# Runway CLI

Command-line tool for deploying projects to Runway deployment server.

## Installation

### From Source (Development)

```bash
# From the monorepo root
npm install
npm run build:cli

# Link globally for development
cd cli
npm link
```

### Global Installation (Production)

```bash
npm install -g @runway/cli
```

## Quick Start

```bash
# 1. Configure CLI with your Runway server
runway init --server https://deploy.example.com

# 2. Navigate to your project directory
cd my-react-app

# 3. Deploy
runway deploy
```

## Commands

### `runway init`

Configure the CLI with your Runway server URL and credentials.

```bash
# Interactive mode
runway init

# With server URL
runway init --server https://deploy.example.com
```

**Options:**
- `-s, --server <url>` - Runway server URL

The CLI stores configuration in `~/.runway/config.json`.

### `runway deploy`

Deploy the current project to Runway.

```bash
# Interactive mode (prompts for options)
runway deploy

# With options
runway deploy --name my-app --type react

# Build locally before uploading (default, recommended)
runway deploy --build-local

# Upload source and build on server
runway deploy --build-server

# Include environment file
runway deploy --env-file .env.production

# With version tag
runway deploy --version 1.2.3
```

**Options:**
- `-n, --name <name>` - Project name (auto-detected from package.json)
- `-t, --type <type>` - Project type: `react`, `next`, or `node`
- `-v, --version <version>` - Version string for this deployment
- `--build-local` - Build locally before uploading (default)
- `--build-server` - Upload source code and build on server
- `-e, --env-file <path>` - Path to environment file

**Build Modes:**

| Mode | Description | Use Case |
|------|-------------|----------|
| `--build-local` | Build on your machine, upload artifacts | Faster deploys, consistent builds |
| `--build-server` | Upload source, server builds | CI/CD pipelines, no local build tools |

### `runway list`

List all deployed projects.

```bash
runway list
# or
runway ls
```

### `runway status`

Get the status of a deployed project.

```bash
runway status my-app
```

## Supported Project Types

The CLI auto-detects your project type:

| Type | Detection | Build Output |
|------|-----------|--------------|
| **Static** | Has `index.html` (no `package.json` required) | Project root |
| **React** | Has `react` + build tooling (Vite/CRA) | `dist/` or `build/` folder |
| **Next.js** | Has `next` dependency | `.next/` folder |
| **Node.js** | Has `package.json` with `start` script | Full source |

### Detection Priority

1. `index.html` without `package.json` → **Static**
2. `next` dependency → **Next.js**
3. `react` dependency + build tools → **React**
4. `index.html` with `package.json` (no framework) → **Static**
5. `start` script or common entry files → **Node.js**

### Unsupported Projects

The following project types are **not supported**:

- Python, Ruby, Go, or other non-Node.js runtimes
- PHP applications
- Docker-only projects (use the web UI instead)

## Build Process

### Local Build Mode (Recommended)

1. **Detect** - Identifies project type from `package.json` or `index.html`
2. **Build** - Runs your build command (skipped for static sites)
3. **Package** - Creates zip with:
   - Static: All files (excluding `.git`, `node_modules`)
   - React: `dist/`, `package.json`
   - Next.js: `.next/`, `public/`, `package.json`, `next.config.*`
   - Node.js: All source files (excluding `node_modules`, `.git`)
4. **Upload** - Sends zip to Runway server
5. **Deploy** - Server extracts, configures, and starts your app

### Server Build Mode

1. **Package** - Creates zip with full source code (excluding `node_modules`, `.git`)
2. **Upload** - Sends zip to Runway server
3. **Install** - Server runs `npm install`
4. **Build** - Server runs `npm run build`
5. **Deploy** - Server configures and starts your app

**Note:** Static sites always use local build mode (no server-side processing needed).

## Package Manager Support

The CLI detects and uses your preferred package manager:

| Lock File | Package Manager |
|-----------|-----------------|
| `pnpm-lock.yaml` | pnpm |
| `yarn.lock` | yarn |
| `package-lock.json` | npm |

## Configuration

Configuration is stored at `~/.runway/config.json`:

```json
{
  "serverUrl": "https://deploy.example.com",
  "token": "your-jwt-token",
  "defaultBuildMode": "local"
}
```

### Configuration Options

| Key | Description |
|-----|-------------|
| `serverUrl` | Runway server URL |
| `token` | Authentication JWT token |
| `defaultBuildMode` | Default build mode (`local` or `server`) |

## Environment Variables

Include environment variables in your deployment:

```bash
# Create .env.production with your variables
echo "API_URL=https://api.example.com" > .env.production

# Deploy with env file
runway deploy --env-file .env.production
```

## Examples

### Deploy a React App

```bash
cd my-react-app
runway deploy --name my-react-app --type react
```

### Deploy a Next.js App

```bash
cd my-nextjs-app
runway deploy --name my-nextjs-app --type next
```

### Deploy a Node.js API

```bash
cd my-api
runway deploy --name my-api --type node
```

### Deploy a Static HTML Site

```bash
cd my-static-site
runway deploy --name my-site --type static
```

### CI/CD Integration

```yaml
# GitHub Actions example
- name: Deploy to Runway
  run: |
    npm install -g @runway/cli
    runway init --server ${{ secrets.RUNWAY_URL }}
    runway deploy --name my-app --build-local
```

## Troubleshooting

### "CLI not configured"

Run `runway init` to configure the CLI with your server URL.

### "Build failed"

- Check that your project has a valid `build` script in `package.json`
- Ensure all dependencies are installed locally
- Try running `npm run build` manually to see errors

### "Upload failed"

- Verify the server URL is correct
- Check that your authentication token is valid
- Ensure the server is running and accessible

### "Project detection failed"

- Ensure you're in a directory with a valid `package.json`
- Check that `package.json` has a `name` field

## Development

### Building from Source

```bash
# Clone the repository
git clone https://github.com/your-org/runway.git
cd runway

# Install dependencies
npm install

# Build shared types and CLI
npm run build:cli

# Run CLI in development
cd cli
npm run dev -- deploy
```

### Project Structure

```
cli/
├── src/
│   ├── index.ts              # Entry point, Commander setup
│   ├── commands/
│   │   ├── init.ts           # runway init
│   │   ├── deploy.ts         # runway deploy
│   │   ├── list.ts           # runway list
│   │   └── status.ts         # runway status
│   ├── services/
│   │   ├── projectDetector.ts # Auto-detect project type
│   │   ├── buildService.ts    # Run local builds
│   │   ├── packageService.ts  # Create deployment zip
│   │   └── uploadService.ts   # Upload to server
│   └── utils/
│       ├── config.ts          # CLI configuration
│       └── logger.ts          # Colored output
└── package.json
```

## License

MIT
