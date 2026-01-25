import fs from 'fs';
import path from 'path';
import lockfile from 'proper-lockfile';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

const DATA_DIR = path.resolve(process.cwd(), '../data');
const PORTS_FILE = path.join(DATA_DIR, 'ports.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize ports file if not exists
if (!fs.existsSync(PORTS_FILE)) {
  fs.writeFileSync(PORTS_FILE, '{}');
}

// Map of port number to service ID (project ID or service name)
type PortMap = Record<number, string>;

export class PortManager {
  private readonly MIN_PORT = 10000;
  private readonly MAX_PORT = 60000;

  private async readPorts(): Promise<PortMap> {
    try {
      const raw = await fs.promises.readFile(PORTS_FILE, 'utf-8');
      return JSON.parse(raw);
    } catch (error) {
      logger.error('Failed to read ports file', error);
      throw new AppError('Port database read error', 500);
    }
  }

  private async writePorts(ports: PortMap): Promise<void> {
    try {
      const release = await lockfile.lock(PORTS_FILE);
      try {
        await fs.promises.writeFile(PORTS_FILE, JSON.stringify(ports, null, 2));
      } finally {
        await release();
      }
    } catch (error) {
      logger.error('Failed to write ports file', error);
      throw new AppError('Port database write error', 500);
    }
  }

  async allocatePort(serviceId: string): Promise<number> {
    const release = await lockfile.lock(PORTS_FILE);
    try {
      const ports = await this.readPorts();
      
      // Check if service already has a port?
      // Optional: enforce one port per service? 
      // Plan doesn't strictly say, but usually yes.
      // But maybe we want multiple ports? 
      // For now, let's just find a new random port.

      let attempt = 0;
      let port = 0;
      const usedPorts = new Set(Object.keys(ports).map(Number));

      while (attempt < 100) {
        port = Math.floor(Math.random() * (this.MAX_PORT - this.MIN_PORT + 1)) + this.MIN_PORT;
        if (!usedPorts.has(port)) {
          break;
        }
        attempt++;
      }

      if (usedPorts.has(port)) {
        throw new AppError('Failed to allocate a free port after multiple attempts', 503);
      }

      ports[port] = serviceId;
      await fs.promises.writeFile(PORTS_FILE, JSON.stringify(ports, null, 2));

      return port;
    } finally {
      await release();
    }
  }

  async releasePort(port: number): Promise<void> {
    const release = await lockfile.lock(PORTS_FILE);
    try {
      const ports = await this.readPorts();
      if (ports[port]) {
        delete ports[port];
        await fs.promises.writeFile(PORTS_FILE, JSON.stringify(ports, null, 2));
      }
    } finally {
      await release();
    }
  }

  async getPortForService(serviceId: string): Promise<number | null> {
    const ports = await this.readPorts();
    const entry = Object.entries(ports).find(([_, id]) => id === serviceId);
    return entry ? Number(entry[0]) : null;
  }
}

export const portManager = new PortManager();
