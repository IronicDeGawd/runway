# Portable Deployment Control Panel (PDCP)

## 1. Overview

The Portable Deployment Control Panel (PDCP) is a **self-hostable deployment and runtime management layer** for Debian-based Linux systems. It is designed to simplify deploying frontend and backend applications on single-node servers (EC2, VPS, home servers, Raspberry Pi) without requiring SSH-heavy workflows, Git configuration on servers, or CI/CD pipelines.

PDCP is optimized for **hackathons, MVPs, and fast iteration**, while remaining robust enough for longer-running personal or small-team projects.

---

## 2. Goals

* Enable ZIP-based deployments for frontend and backend projects
* Eliminate server-side Git setup requirements
* Provide per-project ENV management
* Provide safe-by-default networking and port isolation
* Enable multi-app hosting on a single machine
* Offer optional service orchestration (Postgres, Redis)
* Deliver a polished, high-quality UX

---

## 3. Non-Goals

* Not a CI/CD system
* Not Kubernetes or container orchestration
* Not multi-user SaaS
* Not a secrets vault or enterprise security solution
* Not designed for multi-node or distributed systems

---

## 4. Supported Platforms

### Operating Systems

* Debian-based Linux distributions

  * Ubuntu 20.04+
  * Ubuntu 22.04+
  * Debian 11+

### Hardware

* x86_64 and ARM64
* EC2, VPS, bare metal, Raspberry Pi (best-effort)

---

## 5. Technology Stack

### Control Plane Backend

* Node.js (LTS)
* TypeScript
* PM2 (process manager)

### Control Plane Frontend

* React (Vite)
* Modern CSS (Tailwind or equivalent)
* Motion/animation library (e.g., Framer Motion)

### Networking

* Caddy (reverse proxy, HTTPS)

### Optional Services

* Docker + Docker Compose (installed only if enabled)
* Postgres (Dockerized)
* Redis (Dockerized)

---

## 6. High-Level Architecture

* Single-node system
* Control panel runs as a dedicated PM2 process
* User applications run as isolated PM2 processes
* All public traffic flows exclusively through Caddy (80/443)
* Internal services and dashboards use randomized, non-public ports

---

## 7. Directory Structure

```
/opt/pdcp/
├── server/              # Control plane backend
├── ui/                  # Control plane frontend
├── templates/           # PM2, Caddy, service templates
├── data/                # Metadata, ports, project registry
└── logs/

/apps/
├── frontend/
├── backend/
└── services/
```

---

## 8. Installer & Bootstrap

### Installation

* Single command installer
* Verifies OS compatibility
* Installs:

  * Node.js
  * PM2
  * Caddy
  * Control Panel
* Optional prompt to install Docker

### On Boot

* Control panel auto-starts via PM2
* Caddy auto-starts
* Docker auto-starts only if installed

---

## 9. Supported Project Types (v1)

| Type              | Runtime                |
| ----------------- | ---------------------- |
| React (Vite)      | Static build via Caddy |
| Next.js           | Node runtime via PM2   |
| Node.js / Express | Node runtime via PM2   |

Project type is explicitly selected by the user.

---

## 10. ZIP-Based Deployment Engine

### Deployment Flow

1. User uploads ZIP
2. ZIP extracted to temporary directory
3. Structure validated
4. Existing project directory replaced
5. Dependencies installed
6. Build executed (if frontend)
7. PM2 config rendered
8. Service restarted

### Safety Rules

* No path traversal
* No symlinks
* ZIP contents never executed directly
* ENVs are not read from ZIP

---

## 11. ENV Manager

### Scope

* ENVs are scoped per project
* ENVs are not stored in source code

### Storage

* Structured JSON per project

### Injection

* Backend: injected via PM2 `env`
* Frontend: injected at build time

### Behavior

* Backend ENV change → restart required
* Frontend ENV change → rebuild required

---

## 12. Random Port Manager

### Principles

* Avoid common and well-known ports
* Reduce accidental public exposure
* Enforce internal-only access by default

### Port Types

* Control Panel Port (random)
* Internal App Ports (random)
* Docker Service Ports (localhost-only)

Ports are persisted and never reallocated unless explicitly reset.

---

## 13. Caddy Template Engine

* Reverse proxy for all apps
* Automatic HTTPS
* Domain-based routing
* Zero manual Caddyfile edits

Templates provided per runtime type.

---

## 14. PM2 Template Engine

* Predefined templates for:

  * Node backend
  * Next.js
  * Control panel

Advanced mode allows editing:

* Memory limits
* Instance count
* Restart policies

---

## 15. Optional Services (Docker)

### Enablement

* Docker is optional
* Installed only if user opts in
* Can be enabled post-install

### Services

* Postgres
* Redis

### Dashboard Capabilities

* Start / Stop services
* View connection strings
* Read-only table inspection
* Clear / flush operations

---

## 16. Multi-Project Hosting

* Unlimited projects per machine
* Each project has:

  * Dedicated directory
  * Dedicated ENV set
  * Dedicated internal port
  * Dedicated PM2 process

---

## 17. Dashboard Pages

* Login / Access
* Overview (system + services)
* Projects list
* Project details
* Deploy new project
* ENV editor
* Logs viewer
* Databases (conditional)
* Settings

---

## 18. Security Defaults

* Dashboard uses random port
* Dashboard exposed publicly only if explicitly enabled
* Token-based authentication
* No arbitrary command execution
* No shell access from UI

---

## 19. Runtime Lifecycle

1. Server boots
2. Control panel starts
3. User deploys project
4. Ports allocated
5. ENVs injected
6. PM2 process started
7. Caddy routes traffic

---

## 20. Future Enhancements (Out of Scope for v1)

* Rollbacks
* Metrics
* Multiple UI themes
* Plugin system
* Secrets encryption

---

## 21. Summary

PDCP is a focused, opinionated deployment control layer designed for speed, clarity, and developer ergonomics. It intentionally avoids complexity while providing powerful primitives for real-world MVP deployment workflows.
