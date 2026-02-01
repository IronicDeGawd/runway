<div align="center">

# Runway

**Self-hosted deployment platform for web applications**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-22+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express&logoColor=white)](https://expressjs.com)

Deploy React, Next.js, Node.js, and static sites from a single control panel.

</div>

---

> **Note:** Currently only tested on **Ubuntu/Debian** systems. Other Linux distributions may work but are not officially supported. Windows and macOS are not supported for production deployments.

## Runtime Support Status

| Runtime | Build | Process | WebSocket | REST API | Env Mgmt | Serving |
|---------|:-----:|:-------:|:---------:|:--------:|:--------:|:-------:|
| **Node.js** | - | PM2 | Working | Working | Working | PM2 |
| **React** | Working | - | Working | Working | Working | Caddy |
| **Next.js** | Untested | Untested | Untested | Untested | Untested | PM2 |
| **Static** | - | - | - | Working | - | Caddy |

---

## Overview

Runway provides end-to-end application deployment with a CLI tool, web dashboard, and backend server. It handles project detection, builds, process management, and reverse proxy configuration automatically.

### Key Features

<table>
<tr>
<td width="50%">

**Deployment**
- Auto-detect project types
- Local or server-side builds
- Environment variable injection
- Version management

</td>
<td width="50%">

**Management**
- Real-time monitoring via WebSocket
- Process control (start/stop/restart)
- CPU & memory metrics
- Activity logging

</td>
</tr>
<tr>
<td width="50%">

**Infrastructure**
- Automatic reverse proxy (Caddy)
- SSL/TLS certificate management
- Docker service integration
- SQLite for persistence

</td>
<td width="50%">

**Security**
- JWT authentication
- RSA key exchange for CLI
- HTTPS enforcement in production
- Token-based access control

</td>
</tr>
</table>

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│     CLI     │────▶│   Server    │◀────│     UI      │
│  (deploy)   │     │  (Express)  │     │   (React)   │
└─────────────┘     └──────┬──────┘     └─────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
    ┌──────────┐   ┌──────────┐   ┌──────────┐
    │  SQLite  │   │   PM2    │   │  Caddy   │
    │ (data)   │   │(process) │   │ (proxy)  │
    └──────────┘   └──────────┘   └──────────┘
```

## Components

| Component | Description | Tech Stack |
|-----------|-------------|------------|
| **CLI** | Command-line deployment tool | ![TypeScript](https://img.shields.io/badge/-TypeScript-3178C6?logo=typescript&logoColor=white&style=flat-square) ![Commander](https://img.shields.io/badge/-Commander-red?style=flat-square) |
| **UI** | Web dashboard | ![React](https://img.shields.io/badge/-React_18-61DAFB?logo=react&logoColor=black&style=flat-square) ![Vite](https://img.shields.io/badge/-Vite-646CFF?logo=vite&logoColor=white&style=flat-square) ![Tailwind](https://img.shields.io/badge/-Tailwind-06B6D4?logo=tailwindcss&logoColor=white&style=flat-square) |
| **Server** | Backend API & orchestration | ![Express](https://img.shields.io/badge/-Express-000?logo=express&logoColor=white&style=flat-square) ![SQLite](https://img.shields.io/badge/-SQLite-003B57?logo=sqlite&logoColor=white&style=flat-square) ![PM2](https://img.shields.io/badge/-PM2-2B037A?logo=pm2&logoColor=white&style=flat-square) |
| **Shared** | Common TypeScript types | ![TypeScript](https://img.shields.io/badge/-TypeScript-3178C6?logo=typescript&logoColor=white&style=flat-square) |

## Quick Start

### Prerequisites

- Node.js 18+
- npm 8+
- PM2 (for production)
- Caddy (for reverse proxy)

### Development Setup

```bash
# Clone the repository
git clone https://github.com/IronicDeGawd/runway.git
cd runway

# Install dependencies
npm install

# Build all packages
npm run build

# Start development servers
npm run dev
```

This starts:
- Server on `http://localhost:3000`
- UI on `http://localhost:8080` (proxies API requests to server)

---

## CLI

The CLI enables deployments directly from your terminal.

### Installation

```bash
# Build and link globally
npm run build:cli
cd cli && npm link

# Verify installation
runway --version
```

### Usage

```bash
# Configure server connection
runway init --server https://deploy.example.com

# Deploy a project
runway deploy

# Deploy with options
runway deploy --name my-app --type react --build-local

# List deployments
runway list

# Check project status
runway status my-app
```

### Commands

| Command | Description |
|---------|-------------|
| `runway init` | Configure server URL and authenticate |
| `runway deploy` | Deploy current directory |
| `runway list` | List all deployed projects |
| `runway status <name>` | Get project status |

### Deploy Options

| Option | Description |
|--------|-------------|
| `--name <name>` | Project name |
| `--type <type>` | Project type: react, next, node, static |
| `--version <ver>` | Version label |
| `--build-local` | Build locally before upload (default) |
| `--build-server` | Upload source, build on server |
| `--env-file <path>` | Path to .env file for injection |

### Project Detection

The CLI auto-detects project types:
- `index.html` without package.json → **Static**
- `next` dependency → **Next.js**
- `react` dependency + build tools → **React**
- `package.json` with start script → **Node.js**

---

## UI

The web dashboard for managing deployments.

### Development

```bash
cd ui
npm run dev      # http://localhost:8080
```

### Build

```bash
npm run build    # Creates dist/
```

### Pages

| Page | Description |
|------|-------------|
| **Overview** | Dashboard with stats and activity |
| **Projects** | List and manage deployments |
| **Project Details** | Logs, metrics, processes, environment |
| **Deploy** | Upload and deploy new projects |
| **Services** | Manage Docker services (PostgreSQL, Redis) |
| **Settings** | Configure domain and security mode |

### Features

- Real-time updates via WebSocket
- Environment variable management
- Process control (start/stop/restart)
- Resource metrics (CPU/Memory)
- Activity logging

---

## Server

The backend API handling deployments and process management.

### Development

```bash
cd server
npm run dev      # http://localhost:3000
```

### Build

```bash
npm run build
npm start
```

### API Routes

**Authentication**
- `POST /api/auth/login` - Web UI login
- `POST /api/cli/auth/authenticate` - CLI authentication

**Projects**
- `GET /api/project` - List projects
- `POST /api/project/deploy` - Deploy project
- `GET /api/project/:id` - Get project details
- `DELETE /api/project/:id` - Delete project

**Process Management**
- `POST /api/process/:id/start` - Start project
- `POST /api/process/:id/stop` - Stop project
- `POST /api/process/:id/restart` - Restart project

**Environment**
- `GET /api/project/:id/env` - Get environment variables
- `PATCH /api/project/:id/env` - Update environment variables

**Metrics & Activity**
- `GET /api/metrics/:id` - Get resource metrics
- `GET /api/activity` - Get activity log

### Configuration

Environment variables:
- `PORT` - Server port (default: 3000)
- `JWT_SECRET` - JWT signing secret
- `NODE_ENV` - Environment (development/production)

### Directory Structure

```
/opt/runway/           # Production installation
├── server/dist/       # Compiled backend
├── ui/dist/           # Built frontend
├── apps/              # Deployed applications
├── data/
│   ├── runway.db      # SQLite database
│   ├── auth.json      # Admin credentials
│   └── caddy/         # Caddy configurations
├── logs/              # Application logs
└── temp_uploads/      # Upload staging
```

---

## Production Deployment

### One-Line Install

```bash
curl -sSL https://raw.githubusercontent.com/IronicDeGawd/runway/main/bootstrap.sh | sudo bash
```

### Manual Installation

1. Download release from GitHub
2. Extract to `/opt/runway`
3. Run `install.sh`
4. Access via configured domain

### Security Modes

| Mode | Use Case | Token Duration |
|------|----------|----------------|
| **IP-HTTP** | Development | 15 minutes |
| **Domain-HTTPS** | Production | 12 hours |

---

## Project Structure

```
runway/
├── cli/                # Command-line tool
│   ├── src/
│   │   ├── commands/   # CLI commands
│   │   ├── services/   # Auth, build, upload
│   │   └── utils/      # Config, logging
│   └── package.json
├── ui/                 # Web dashboard
│   ├── src/
│   │   ├── pages/      # React pages
│   │   ├── components/ # UI components
│   │   └── contexts/   # Auth, WebSocket
│   └── package.json
├── server/             # Backend API
│   ├── src/
│   │   ├── routes/     # API endpoints
│   │   ├── services/   # Core logic
│   │   └── middleware/ # Express middleware
│   └── package.json
├── shared/             # Shared types
│   └── src/types.ts
└── package.json        # Root workspace config
```

---

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start all packages in development |
| `npm run build` | Build all packages |
| `npm run build:cli` | Build shared + CLI only |
| `npm test` | Run tests |

---

## Supported Project Types

| Type | Detection | Build Command | Serve Method |
|------|-----------|---------------|--------------|
| ![React](https://img.shields.io/badge/-React-61DAFB?logo=react&logoColor=black&style=flat-square) | react + vite/webpack | `npm run build` | Static files via Caddy |
| ![Next.js](https://img.shields.io/badge/-Next.js-000?logo=next.js&logoColor=white&style=flat-square) | next dependency | `npm run build` | PM2 process |
| ![Node.js](https://img.shields.io/badge/-Node.js-339933?logo=node.js&logoColor=white&style=flat-square) | package.json + start | None or custom | PM2 process |
| ![HTML5](https://img.shields.io/badge/-Static-E34F26?logo=html5&logoColor=white&style=flat-square) | index.html only | None | Static files via Caddy |

---

## License

[MIT](LICENSE)
