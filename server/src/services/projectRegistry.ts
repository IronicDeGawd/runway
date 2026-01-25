import fs from 'fs';
import path from 'path';
import lockfile from 'proper-lockfile';
import { ProjectConfig } from '@pdcp/shared';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

const DATA_DIR = path.resolve(process.cwd(), '../data');
const REGISTRY_FILE = path.join(DATA_DIR, 'projects.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize registry file if not exists
if (!fs.existsSync(REGISTRY_FILE)) {
  fs.writeFileSync(REGISTRY_FILE, '[]');
}

export class ProjectRegistry {
  private async readRegistry(): Promise<ProjectConfig[]> {
    try {
      const raw = await fs.promises.readFile(REGISTRY_FILE, 'utf-8');
      return JSON.parse(raw);
    } catch (error) {
      logger.error('Failed to read project registry', error);
      throw new AppError('Database read error', 500);
    }
  }

  private async writeRegistry(projects: ProjectConfig[]): Promise<void> {
    try {
      // Use proper-lockfile to lock the file during write
      const release = await lockfile.lock(REGISTRY_FILE);
      
      try {
        await fs.promises.writeFile(REGISTRY_FILE, JSON.stringify(projects, null, 2));
      } finally {
        await release();
      }
    } catch (error) {
      logger.error('Failed to write project registry', error);
      throw new AppError('Database write error', 500);
    }
  }

  async getAll(): Promise<ProjectConfig[]> {
    return this.readRegistry();
  }

  async getById(id: string): Promise<ProjectConfig | undefined> {
    const projects = await this.readRegistry();
    return projects.find(p => p.id === id);
  }

  async create(project: ProjectConfig): Promise<void> {
    const release = await lockfile.lock(REGISTRY_FILE);
    try {
      const projects = await this.readRegistry();
      if (projects.find(p => p.id === project.id || p.name === project.name)) {
        throw new AppError('Project already exists', 409);
      }
      projects.push(project);
      await fs.promises.writeFile(REGISTRY_FILE, JSON.stringify(projects, null, 2));
    } finally {
      await release();
    }
  }

  async update(id: string, updates: Partial<ProjectConfig>): Promise<void> {
    const release = await lockfile.lock(REGISTRY_FILE);
    try {
      const projects = await this.readRegistry();
      const index = projects.findIndex(p => p.id === id);
      
      if (index === -1) {
        throw new AppError('Project not found', 404);
      }

      projects[index] = { ...projects[index], ...updates };
      await fs.promises.writeFile(REGISTRY_FILE, JSON.stringify(projects, null, 2));
    } finally {
      await release();
    }
  }

  async delete(id: string): Promise<void> {
    const release = await lockfile.lock(REGISTRY_FILE);
    try {
      const projects = await this.readRegistry();
      const filtered = projects.filter(p => p.id !== id);
      
      if (projects.length === filtered.length) {
        throw new AppError('Project not found', 404);
      }

      await fs.promises.writeFile(REGISTRY_FILE, JSON.stringify(filtered, null, 2));
    } finally {
      await release();
    }
  }
}

export const projectRegistry = new ProjectRegistry();
