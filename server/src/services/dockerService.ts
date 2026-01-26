import { exec } from 'child_process';
import util from 'util';
import fs from 'fs-extra';
import path from 'path';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import { eventBus } from '../events/eventBus';

const execAsync = util.promisify(exec);
const DATA_DIR = path.resolve(process.cwd(), '../data');
const COMPOSE_FILE = path.join(DATA_DIR, 'docker-compose.yml');

export type ServiceType = 'postgres' | 'redis';

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

  async ensureComposeFile() {
    if (!fs.existsSync(COMPOSE_FILE)) {
      const composeContent = `
version: '3'
services:
  postgres:
    image: postgres:15
    container_name: pdcp-postgres
    restart: unless-stopped
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: pdcp_user
      POSTGRES_PASSWORD: pdcp_password
      POSTGRES_DB: pdcp_db
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7
    container_name: pdcp-redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
`.trim();
      await fs.writeFile(COMPOSE_FILE, composeContent);
    }
  }

  async getServices(): Promise<ServiceStatus[]> {
    await this.ensureDockerChecked();
    
    logger.info(`Getting services, Docker available: ${this.isDockerAvailable}`);
    
    if (!this.isDockerAvailable) {
      return [];
    }

    const services: ServiceStatus[] = [];

    try {
      // Check both running and stopped containers
      const { stdout: allContainers } = await execAsync(
        'docker ps -a --filter "name=pdcp-" --format "{{.Names}}\t{{.Status}}"'
      );
      
      const containerLines = allContainers.trim().split('\n').filter(line => line);
      const containerMap = new Map<string, string>();
      
      for (const line of containerLines) {
        const [name, status] = line.split('\t');
        if (name) containerMap.set(name, status);
      }

      // Only add Postgres if container exists
      if (containerMap.has('pdcp-postgres')) {
        const statusText = containerMap.get('pdcp-postgres') || '';
        const isRunning = statusText.toLowerCase().includes('up');
        
        const pgService: ServiceStatus = {
          id: 'postgres',
          name: 'PostgreSQL',
          type: 'postgres',
          status: isRunning ? 'running' : 'stopped',
          version: '15',
          port: 5432,
          memory: 0,
          connectionString: 'postgresql://pdcp_user:pdcp_password@localhost:5432/pdcp_db'
        };

        // Get memory and version if running
        if (isRunning) {
          try {
            const { stdout: memStats } = await execAsync(
              "docker stats pdcp-postgres --no-stream --format '{{.MemUsage}}'"
            );
            const memMatch = memStats.match(/([\d.]+)MiB/);
            if (memMatch) pgService.memory = Math.round(parseFloat(memMatch[1]));
          } catch (e) {
            pgService.memory = 0;
          }

          try {
            const { stdout: pgVersion } = await execAsync(
              "docker exec pdcp-postgres psql -U pdcp_user -t -c 'SELECT version()'"
            );
            const match = pgVersion.match(/PostgreSQL ([\d.]+)/);
            if (match) pgService.version = match[1];
          } catch (e) {
            // Keep default version
          }
        }

        services.push(pgService);
      }

      // Only add Redis if container exists
      if (containerMap.has('pdcp-redis')) {
        const statusText = containerMap.get('pdcp-redis') || '';
        const isRunning = statusText.toLowerCase().includes('up');
        
        const redisService: ServiceStatus = {
          id: 'redis',
          name: 'Redis Cache',
          type: 'redis',
          status: isRunning ? 'running' : 'stopped',
          version: '7',
          port: 6379,
          memory: 0,
          connectionString: 'redis://localhost:6379'
        };

        // Get memory and version if running
        if (isRunning) {
          try {
            const { stdout: memStats } = await execAsync(
              "docker stats pdcp-redis --no-stream --format '{{.MemUsage}}'"
            );
            const memMatch = memStats.match(/([\d.]+)MiB/);
            if (memMatch) redisService.memory = Math.round(parseFloat(memMatch[1]));
          } catch (e) {
            redisService.memory = 0;
          }

          try {
            const { stdout: redisVersion } = await execAsync(
              "docker exec pdcp-redis redis-cli INFO SERVER | grep redis_version"
            );
            const match = redisVersion.match(/redis_version:([\d.]+)/);
            if (match) redisService.version = match[1];
          } catch (e) {
            // Keep default version
          }
        }

        services.push(redisService);
      }

    } catch (error: any) {
       logger.warn('Failed to check docker containers:', error?.message || error);
    }

    logger.info(`Returning ${services.length} service(s)`);
    return services;
  }

  async startService(type: ServiceType): Promise<void> {
    await this.ensureDockerChecked();
    if (!this.isDockerAvailable) throw new AppError('Docker not installed', 503);
    await this.ensureComposeFile();

    try {
        await execAsync(`docker compose -f ${COMPOSE_FILE} up -d ${type}`);
        
        // Emit event for realtime updates
        eventBus.emitEvent('service:change', {
          type,
          status: 'running'
        });
    } catch (error) {
        logger.error(`Failed to start ${type}`, error);
        
        // Emit error status
        eventBus.emitEvent('service:change', {
          type,
          status: 'error'
        });
        
        throw new AppError(`Failed to start ${type}`, 500);
    }
  }

  async stopService(type: ServiceType): Promise<void> {
    await this.ensureDockerChecked();
    if (!this.isDockerAvailable) throw new AppError('Docker not installed', 503);
    
    try {
        await execAsync(`docker compose -f ${COMPOSE_FILE} stop ${type}`);
        
        // Emit event for realtime updates
        eventBus.emitEvent('service:change', {
          type,
          status: 'stopped'
        });
    } catch (error) {
        logger.error(`Failed to stop ${type}`, error);
        
        // Emit error status
        eventBus.emitEvent('service:change', {
          type,
          status: 'error'
        });
        
        throw new AppError(`Failed to stop ${type}`, 500);
    }
  }

  async createService(
    type: ServiceType,
    config?: { port?: number; credentials?: { username?: string; password?: string; database?: string } }
  ): Promise<void> {
    await this.ensureDockerChecked();
    if (!this.isDockerAvailable) throw new AppError('Docker not installed', 503);

    // Check if container already exists
    try {
      const { stdout } = await execAsync('docker ps -a --filter \"name=pdcp-\" --format \"{{.Names}}\"');
      const containers = stdout.split('\\n').filter(line => line);
      if (containers.includes(`pdcp-${type}`)) {
        throw new AppError(`${type} service already exists. Delete it first or start the existing one.`, 409);
      }
    } catch (error: any) {
      if (error.message?.includes('already exists')) throw error;
      // Continue if error is just from docker command not finding containers
    }

    // Update compose file with custom config if provided
    if (config) {
      await this.updateComposeFileWithConfig(type, config);
    } else {
      await this.ensureComposeFile();
    }

    // Create and start the service
    try {
      await execAsync(`docker compose -f ${COMPOSE_FILE} up -d ${type}`);
      logger.info(`Created and started ${type} service`);
      
      eventBus.emitEvent('service:change', {
        type,
        status: 'running'
      });
    } catch (error) {
      logger.error(`Failed to create ${type}`, error);
      throw new AppError(`Failed to create ${type} service`, 500);
    }
  }

  async deleteService(type: ServiceType): Promise<void> {
    await this.ensureDockerChecked();
    if (!this.isDockerAvailable) throw new AppError('Docker not installed', 503);

    try {
      // Stop and remove container and volumes
      await execAsync(`docker compose -f ${COMPOSE_FILE} down ${type} -v`);
      logger.info(`Deleted ${type} service and its volumes`);
      
      // Emit event for realtime updates (using 'stopped' as deleted services won't appear in list)
      eventBus.emitEvent('service:change', {
        type,
        status: 'stopped'
      });
    } catch (error) {
      logger.error(`Failed to delete ${type}`, error);
      throw new AppError(`Failed to delete ${type} service`, 500);
    }
  }

  private async updateComposeFileWithConfig(
    type: ServiceType,
    config: { port?: number; credentials?: { username?: string; password?: string; database?: string } }
  ): Promise<void> {
    const defaultPort = type === 'postgres' ? 5432 : 6379;
    const port = config.port || defaultPort;

    let composeContent: string;

    if (type === 'postgres') {
      const username = config.credentials?.username || 'pdcp_user';
      const password = config.credentials?.password || 'pdcp_password';
      const database = config.credentials?.database || 'pdcp_db';

      composeContent = `
version: '3'
services:
  postgres:
    image: postgres:15
    container_name: pdcp-postgres
    restart: unless-stopped
    ports:
      - "${port}:5432"
    environment:
      POSTGRES_USER: ${username}
      POSTGRES_PASSWORD: ${password}
      POSTGRES_DB: ${database}
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7
    container_name: pdcp-redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
`.trim();
    } else {
      // Redis
      composeContent = `
version: '3'
services:
  postgres:
    image: postgres:15
    container_name: pdcp-postgres
    restart: unless-stopped
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: pdcp_user
      POSTGRES_PASSWORD: pdcp_password
      POSTGRES_DB: pdcp_db
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7
    container_name: pdcp-redis
    restart: unless-stopped
    ports:
      - "${port}:6379"
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
`.trim();
    }

    await fs.writeFile(COMPOSE_FILE, composeContent);
  }
}

export const dockerService = new DockerService();
