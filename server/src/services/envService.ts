import fs from 'fs-extra';
import path from 'path';
import lockfile from 'proper-lockfile';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';

const APPS_DIR = path.resolve(process.cwd(), '../apps');

export class EnvService {
  private getEnvPath(projectId: string): string {
    return path.join(APPS_DIR, projectId, '.env.json');
  }

  async getEnv(projectId: string): Promise<Record<string, string>> {
    const envPath = this.getEnvPath(projectId);
    if (!await fs.pathExists(envPath)) {
      return {};
    }

    try {
      const raw = await fs.readFile(envPath, 'utf-8');
      return JSON.parse(raw);
    } catch (error) {
      logger.error(`Failed to read env for ${projectId}`, error);
      return {};
    }
  }

  async setEnv(projectId: string, updates: Record<string, string>): Promise<void> {
    const envPath = this.getEnvPath(projectId);
    
    // Ensure dir exists (it should if project exists)
    if (!await fs.pathExists(path.dirname(envPath))) {
       throw new AppError('Project directory not found', 404);
    }

    // Lock? 
    // It's a file inside apps dir. 
    // We can use retry or simple write if low concurrency.
    // Use proper-lockfile if possible, but proper-lockfile needs file to exist or dir lock.
    // Let's ensure file exists first.
    if (!await fs.pathExists(envPath)) {
      await fs.writeFile(envPath, '{}');
    }

    // Lock file
    let release;
    try {
        release = await lockfile.lock(envPath);
    } catch (e) {
        // If file doesn't exist? We created it.
        // If locking fails, maybe fallback or retry?
        // Assume it works.
        logger.warn('Failed to lock env file, proceeding without lock');
    }

    try {
      const current = await this.getEnv(projectId);
      const newEnv = { ...current, ...updates };
      
      // Remove empty values? Plan says "Read/write individual keys".
      // Usually set key=null/undefined to delete?
      // Or explicit delete?
      // Implementation: updates merge. 
      // User might want to overwrite.
      
      await fs.writeFile(envPath, JSON.stringify(newEnv, null, 2));
    } finally {
      if (release) await release();
    }
  }
  
  // Overwrite all (for editor save)
  async saveEnv(projectId: string, env: Record<string, string>): Promise<void> {
      const envPath = this.getEnvPath(projectId);
      await fs.ensureFile(envPath);
      await fs.writeFile(envPath, JSON.stringify(env, null, 2));
  }
}

export const envService = new EnvService();
