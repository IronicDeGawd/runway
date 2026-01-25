import { exec } from 'child_process';
import util from 'util';
import fs from 'fs-extra';
import path from 'path';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';

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
  connectionString?: string;
}

export class DockerService {
  private isDockerAvailable: boolean = false;

  constructor() {
    this.checkDocker();
  }

  async checkDocker() {
    try {
      await execAsync('docker --version');
      this.isDockerAvailable = true;
    } catch (e) {
      this.isDockerAvailable = false;
      logger.warn('Docker not found. Optional services will be unavailable.');
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
    if (!this.isDockerAvailable) {
      return [{
        id: 'docker-unavailable',
        name: 'Docker Not Installed',
        type: 'postgres',
        status: 'error',
        version: 'N/A',
        port: 0,
        connectionString: 'Install Docker to use managed services'
      }];
    }

    const services: ServiceStatus[] = [
      {
        id: 'postgres',
        name: 'PostgreSQL',
        type: 'postgres',
        status: 'stopped',
        version: '15',
        port: 5432,
        connectionString: 'postgresql://pdcp_user:pdcp_password@localhost:5432/pdcp_db'
      },
      {
        id: 'redis',
        name: 'Redis Cache',
        type: 'redis',
        status: 'stopped',
        version: '7',
        port: 6379,
        connectionString: 'redis://localhost:6379'
      }
    ];

    try {
      const { stdout } = await execAsync('docker ps --format "{{.Names}}"');
      const runningContainers = stdout.split('\n');
      
      if (runningContainers.includes('pdcp-postgres')) {
        services[0].status = 'running';
      }
      
      if (runningContainers.includes('pdcp-redis')) {
        services[1].status = 'running';
      }

      // Get actual versions from running containers
      if (services[0].status === 'running') {
        try {
          const { stdout: pgVersion } = await execAsync(
            "docker exec pdcp-postgres psql -U pdcp_user -t -c 'SELECT version()'"
          );
          const match = pgVersion.match(/PostgreSQL ([\d.]+)/);
          if (match) services[0].version = match[1];
        } catch (e) {
          // Keep default version
        }
      }

      if (services[1].status === 'running') {
        try {
          const { stdout: redisVersion } = await execAsync(
            "docker exec pdcp-redis redis-cli INFO SERVER | grep redis_version"
          );
          const match = redisVersion.match(/redis_version:([\d.]+)/);
          if (match) services[1].version = match[1];
        } catch (e) {
          // Keep default version
        }
      }

    } catch (error) {
       logger.warn('Failed to check docker status', error);
    }

    return services;
  }

  async startService(type: ServiceType): Promise<void> {
    if (!this.isDockerAvailable) throw new AppError('Docker not installed', 503);
    await this.ensureComposeFile();

    try {
        await execAsync(`docker compose -f ${COMPOSE_FILE} up -d ${type}`);
    } catch (error) {
        logger.error(`Failed to start ${type}`, error);
        throw new AppError(`Failed to start ${type}`, 500);
    }
  }

  async stopService(type: ServiceType): Promise<void> {
    if (!this.isDockerAvailable) throw new AppError('Docker not installed', 503);
    
    try {
        await execAsync(`docker compose -f ${COMPOSE_FILE} stop ${type}`);
    } catch (error) {
        logger.error(`Failed to stop ${type}`, error);
        throw new AppError(`Failed to stop ${type}`, 500);
    }
  }
}

export const dockerService = new DockerService();
