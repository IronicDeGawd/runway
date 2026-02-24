import { exec } from 'child_process';
import net from 'net';
import util from 'util';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import { eventBus } from '../events/eventBus';
import { systemRepository } from '../repositories/systemRepository';

const execAsync = util.promisify(exec);
const DATA_DIR = path.resolve(process.cwd(), '../data');
const SERVICES_FILE = path.join(DATA_DIR, 'services.json');

export type ServiceType = 'postgres' | 'redis';

export interface ServiceConfig {
  id: string;           // user-chosen name (slugified)
  type: ServiceType;
  port: number;         // host port
  containerName: string;
  credentials?: {
    username?: string;
    password?: string;
    database?: string;
  };
}

export interface ServiceStatus {
  id: string;
  name: string;
  type: ServiceType;
  status: 'running' | 'stopped' | 'error';
  version: string;
  port: number;
  memory?: number;
  connectionString?: string;
}

export interface ExternalContainer {
  id: string;
  name: string;
  image: string;
  status: 'running' | 'stopped';
  ports: string;
  memory?: number;
}

// ── Service Registry ─────────────────────────────────────────────────────────

function loadRegistry(): ServiceConfig[] {
  try {
    if (fs.existsSync(SERVICES_FILE)) {
      return fs.readJsonSync(SERVICES_FILE);
    }
  } catch (e) {
    logger.warn('Failed to read services registry, starting fresh');
  }
  return [];
}

function saveRegistry(services: ServiceConfig[]): void {
  fs.ensureDirSync(DATA_DIR);
  fs.writeJsonSync(SERVICES_FILE, services, { spaces: 2 });
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

// ── Port helpers ─────────────────────────────────────────────────────────────

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '0.0.0.0');
  });
}

async function findAvailablePort(preferred: number): Promise<number> {
  if (await isPortAvailable(preferred)) return preferred;
  logger.warn(`Port ${preferred} is occupied, scanning for alternatives...`);
  // Scan a range
  for (let p = 10000; p <= 60000; p++) {
    if (await isPortAvailable(p)) {
      logger.info(`Found available port: ${p}`);
      return p;
    }
    // Skip ahead to avoid slow sequential scan
    p += Math.floor(Math.random() * 50);
  }
  throw new AppError('No available port found in range 10000-60000', 500);
}

// ── Docker Service ───────────────────────────────────────────────────────────

export class DockerService {
  private isDockerAvailable: boolean | null = null;
  private dockerCheckPromise: Promise<void>;

  constructor() {
    this.dockerCheckPromise = this.checkDocker();
  }

  private async checkDocker(): Promise<void> {
    try {
      await execAsync('docker --version');
      this.isDockerAvailable = true;
      logger.info('Docker is available');
    } catch (e) {
      this.isDockerAvailable = false;
      logger.warn('Docker not found. Optional services will be unavailable.');
    }
  }

  private async ensureDockerChecked(): Promise<void> {
    if (this.isDockerAvailable === null) {
      await this.dockerCheckPromise;
    }
  }

  /**
   * Get the server's public hostname for connection strings.
   */
  private getServerHost(): string {
    try {
      const domain = systemRepository.getDomain();
      if (domain?.domain && domain.active) return domain.domain;
      const ip = systemRepository.getServerIp();
      if (ip) return ip;
    } catch {
      // DB might not be ready yet
    }
    return os.hostname();
  }

  private getDefaultCredentials(type: ServiceType) {
    if (type === 'postgres') {
      return { username: 'runway_user', password: 'runway_pass', database: 'runway_db' };
    }
    return {};
  }

  private getInternalPort(type: ServiceType): number {
    return type === 'postgres' ? 5432 : 6379;
  }

  private getDefaultPort(type: ServiceType): number {
    return type === 'postgres' ? 5432 : 6379;
  }

  private buildConnectionString(type: ServiceType, host: string, port: number, creds?: ServiceConfig['credentials']): string {
    if (type === 'postgres') {
      const u = creds?.username || 'runway_user';
      const p = creds?.password || 'runway_pass';
      const d = creds?.database || 'runway_db';
      return `postgresql://${u}:${p}@${host}:${port}/${d}`;
    }
    return `redis://${host}:${port}`;
  }

  private buildDockerRunArgs(config: ServiceConfig): string[] {
    const internalPort = this.getInternalPort(config.type);
    const args = [
      'docker', 'run', '-d',
      '--name', config.containerName,
      '--restart', 'unless-stopped',
      '-p', `${config.port}:${internalPort}`,
    ];

    if (config.type === 'postgres') {
      const c = config.credentials || this.getDefaultCredentials('postgres');
      args.push(
        '-e', `POSTGRES_USER=${c.username || 'runway_user'}`,
        '-e', `POSTGRES_PASSWORD=${c.password || 'runway_pass'}`,
        '-e', `POSTGRES_DB=${c.database || 'runway_db'}`,
        '-v', `${config.containerName}-data:/var/lib/postgresql/data`,
        'postgres:15',
      );
    } else {
      args.push(
        '-v', `${config.containerName}-data:/data`,
        'redis:7',
      );
    }
    return args;
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async createService(
    type: ServiceType,
    name: string,
    config?: { port?: number; credentials?: { username?: string; password?: string; database?: string } }
  ): Promise<{ port: number }> {
    await this.ensureDockerChecked();
    if (!this.isDockerAvailable) throw new AppError('Docker not installed', 503);

    const safeName = slugify(name);
    if (!safeName) throw new AppError('Invalid service name', 400);

    const registry = loadRegistry();
    if (registry.find(s => s.id === safeName)) {
      throw new AppError(`Service "${safeName}" already exists. Delete it first or choose a different name.`, 409);
    }

    const preferredPort = config?.port || this.getDefaultPort(type);
    const port = await findAvailablePort(preferredPort);

    const containerName = `runway-svc-${safeName}`;
    const credentials = type === 'postgres'
      ? { ...this.getDefaultCredentials('postgres'), ...config?.credentials }
      : config?.credentials;

    const svcConfig: ServiceConfig = {
      id: safeName,
      type,
      port,
      containerName,
      credentials,
    };

    // Pull image first (in case it's not available)
    const image = type === 'postgres' ? 'postgres:15' : 'redis:7';
    try {
      await execAsync(`docker pull ${image}`);
    } catch {
      logger.warn(`Could not pull ${image}, proceeding with local cache`);
    }

    // Run container
    const args = this.buildDockerRunArgs(svcConfig);
    try {
      await execAsync(args.join(' '));
      logger.info(`Created service "${safeName}" (${type}) on port ${port}`);
    } catch (error: any) {
      // If the container name already exists in docker but not in registry, clean up
      if (error.message?.includes('Conflict')) {
        try { await execAsync(`docker rm -f ${containerName}`); } catch { /* ignore */ }
        await execAsync(args.join(' '));
        logger.info(`Re-created service "${safeName}" (${type}) on port ${port}`);
      } else {
        throw new AppError(`Failed to create ${type} service: ${error.message}`, 500);
      }
    }

    // Save to registry
    registry.push(svcConfig);
    saveRegistry(registry);

    eventBus.emitEvent('service:change', { type, status: 'running' });

    return { port };
  }

  async getServices(): Promise<ServiceStatus[]> {
    await this.ensureDockerChecked();
    if (!this.isDockerAvailable) return [];

    const registry = loadRegistry();
    const host = this.getServerHost();
    const services: ServiceStatus[] = [];

    for (const svc of registry) {
      const status: ServiceStatus = {
        id: svc.id,
        name: svc.id,
        type: svc.type,
        status: 'stopped',
        version: svc.type === 'postgres' ? '15' : '7',
        port: svc.port,
        memory: 0,
        connectionString: this.buildConnectionString(svc.type, host, svc.port, svc.credentials),
      };

      try {
        const { stdout } = await execAsync(
          `docker inspect --format '{{.State.Status}}' ${svc.containerName} 2>/dev/null`
        );
        const state = stdout.trim();
        status.status = state === 'running' ? 'running' : 'stopped';
      } catch {
        status.status = 'stopped';
      }

      if (status.status === 'running') {
        // Memory
        try {
          const { stdout: memStats } = await execAsync(
            `docker stats ${svc.containerName} --no-stream --format '{{.MemUsage}}'`
          );
          const memMatch = memStats.match(/([\d.]+)MiB/);
          if (memMatch) status.memory = Math.round(parseFloat(memMatch[1]));
        } catch { /* ignore */ }

        // Version
        try {
          if (svc.type === 'postgres') {
            const u = svc.credentials?.username || 'runway_user';
            const { stdout: pgVersion } = await execAsync(
              `docker exec ${svc.containerName} psql -U ${u} -t -c 'SELECT version()'`
            );
            const match = pgVersion.match(/PostgreSQL ([\d.]+)/);
            if (match) status.version = match[1];
          } else {
            const { stdout: rv } = await execAsync(
              `docker exec ${svc.containerName} redis-cli INFO SERVER | grep redis_version`
            );
            const match = rv.match(/redis_version:([\d.]+)/);
            if (match) status.version = match[1];
          }
        } catch { /* keep default */ }
      }

      services.push(status);
    }

    return services;
  }

  async startService(name: string): Promise<void> {
    await this.ensureDockerChecked();
    if (!this.isDockerAvailable) throw new AppError('Docker not installed', 503);

    const registry = loadRegistry();
    const svc = registry.find(s => s.id === name);
    if (!svc) throw new AppError(`Service "${name}" not found`, 404);

    try {
      await execAsync(`docker start ${svc.containerName}`);
      eventBus.emitEvent('service:change', { type: svc.type, status: 'running' });
    } catch (error: any) {
      throw new AppError(`Failed to start ${name}: ${error.message}`, 500);
    }
  }

  async stopService(name: string): Promise<void> {
    await this.ensureDockerChecked();
    if (!this.isDockerAvailable) throw new AppError('Docker not installed', 503);

    const registry = loadRegistry();
    const svc = registry.find(s => s.id === name);
    if (!svc) throw new AppError(`Service "${name}" not found`, 404);

    try {
      await execAsync(`docker stop ${svc.containerName}`);
      eventBus.emitEvent('service:change', { type: svc.type, status: 'stopped' });
    } catch (error: any) {
      throw new AppError(`Failed to stop ${name}: ${error.message}`, 500);
    }
  }

  async deleteService(name: string): Promise<void> {
    await this.ensureDockerChecked();
    if (!this.isDockerAvailable) throw new AppError('Docker not installed', 503);

    const registry = loadRegistry();
    const svc = registry.find(s => s.id === name);
    if (!svc) throw new AppError(`Service "${name}" not found`, 404);

    try {
      await execAsync(`docker rm -f ${svc.containerName}`);
      // Optionally remove volume
      try { await execAsync(`docker volume rm ${svc.containerName}-data`); } catch { /* ignore */ }
      logger.info(`Deleted service "${name}" and its data volume`);
    } catch (error: any) {
      throw new AppError(`Failed to delete ${name}: ${error.message}`, 500);
    }

    // Remove from registry
    saveRegistry(registry.filter(s => s.id !== name));
    eventBus.emitEvent('service:change', { type: svc.type, status: 'stopped' });
  }

  async configureService(
    name: string,
    config: { port?: number; credentials?: { username?: string; password?: string; database?: string } }
  ): Promise<void> {
    await this.ensureDockerChecked();
    if (!this.isDockerAvailable) throw new AppError('Docker not installed', 503);

    const registry = loadRegistry();
    const idx = registry.findIndex(s => s.id === name);
    if (idx < 0) throw new AppError(`Service "${name}" not found`, 404);

    const svc = registry[idx];

    // Stop and remove old container
    try { await execAsync(`docker stop ${svc.containerName}`); } catch { /* might not be running */ }
    try { await execAsync(`docker rm ${svc.containerName}`); } catch { /* might not exist */ }

    // Update config
    if (config.port) {
      const port = await findAvailablePort(config.port);
      svc.port = port;
    }
    if (config.credentials && svc.type === 'postgres') {
      svc.credentials = { ...svc.credentials, ...config.credentials };
    }

    // Recreate
    const args = this.buildDockerRunArgs(svc);
    try {
      await execAsync(args.join(' '));
    } catch (error: any) {
      throw new AppError(`Failed to apply configuration: ${error.message}`, 500);
    }

    registry[idx] = svc;
    saveRegistry(registry);

    eventBus.emitEvent('service:change', { type: svc.type, status: 'running' });
    logger.info(`Reconfigured service "${name}" on port ${svc.port}`);
  }

  // ── External container operations (non-Runway) ────────────────────────────

  async getExternalContainers(): Promise<ExternalContainer[]> {
    await this.ensureDockerChecked();
    if (!this.isDockerAvailable) return [];

    try {
      const { stdout } = await execAsync(
        'docker ps -a --format "{{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Ports}}\t{{.Image}}"'
      );

      const lines = stdout.trim().split('\n').filter((l: string) => l);
      const results: ExternalContainer[] = [];

      for (const line of lines) {
        const [id, name, statusText, ports, image] = line.split('\t');
        // Skip Runway-managed containers (both old runway- prefix and new runway-svc- prefix)
        if (!name || name.startsWith('runway-')) continue;

        const isRunning = statusText?.toLowerCase().includes('up') ?? false;

        const container: ExternalContainer = {
          id,
          name,
          image: image || '',
          status: isRunning ? 'running' : 'stopped',
          ports: ports || '',
          memory: 0,
        };

        if (isRunning) {
          try {
            const { stdout: memStats } = await execAsync(
              `docker stats ${id} --no-stream --format '{{.MemUsage}}'`
            );
            const memMatch = memStats.match(/([\d.]+)MiB/);
            if (memMatch) container.memory = Math.round(parseFloat(memMatch[1]));
          } catch { /* ignore */ }
        }

        results.push(container);
      }

      return results;
    } catch (error: any) {
      logger.warn('Failed to list external containers:', error?.message || error);
      return [];
    }
  }

  async startContainer(id: string): Promise<void> {
    await this.ensureDockerChecked();
    if (!this.isDockerAvailable) throw new AppError('Docker not installed', 503);
    try {
      await execAsync(`docker start ${id}`);
      eventBus.emitEvent('service:change', { containerId: id, action: 'start' });
    } catch (error: any) {
      throw new AppError(`Failed to start container: ${error.message}`, 500);
    }
  }

  async stopContainer(id: string): Promise<void> {
    await this.ensureDockerChecked();
    if (!this.isDockerAvailable) throw new AppError('Docker not installed', 503);
    try {
      await execAsync(`docker stop ${id}`);
      eventBus.emitEvent('service:change', { containerId: id, action: 'stop' });
    } catch (error: any) {
      throw new AppError(`Failed to stop container: ${error.message}`, 500);
    }
  }

  async restartContainer(id: string): Promise<void> {
    await this.ensureDockerChecked();
    if (!this.isDockerAvailable) throw new AppError('Docker not installed', 503);
    try {
      await execAsync(`docker restart ${id}`);
      eventBus.emitEvent('service:change', { containerId: id, action: 'restart' });
    } catch (error: any) {
      throw new AppError(`Failed to restart container: ${error.message}`, 500);
    }
  }
}

export const dockerService = new DockerService();
