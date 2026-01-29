
import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { exec } from 'child_process';
import util from 'util';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { getAuthConfig } from '../config/auth';
import { projectRegistry } from './projectRegistry';
import { pm2Service } from './pm2Service';
import { staticProcessService } from './staticProcessService';
import { ProjectConfig } from '@pdcp/shared';

const execAsync = util.promisify(exec);

const APPS_DIR = path.resolve(process.cwd(), '../apps');
const ALGORITHM = 'aes-256-gcm';

export class EnvManager {
  
  /**
   * Derive a 32-byte key from the JWT secret + system salt
   * This ensures the key is consistent across restarts but unique to this installation
   */
  private getEncryptionKey(): Buffer {
    const config = getAuthConfig();
    if (!config) {
      throw new AppError('Auth config not initialized', 500);
    }
    // Use the JWT secret as the source of entropy
    // In a real production app, this should be a separate specific secret
    return crypto.createHash('sha256').update(config.jwtSecret).digest();
  }

  private getEnvPath(projectId: string): string {
    return path.join(APPS_DIR, projectId, '.env.enc');
  }

  /**
   * Encrypts an object to a stored format
   */
  private encrypt(data: Record<string, string>): { iv: string; content: string; authTag: string } {
    const key = this.getEncryptionKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    const jsonStr = JSON.stringify(data);
    let encrypted = cipher.update(jsonStr, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    return {
      iv: iv.toString('hex'),
      content: encrypted,
      authTag: authTag.toString('hex')
    };
  }

  /**
   * Decrypts stored format back to object
   */
  private decrypt(data: { iv: string; content: string; authTag: string }): Record<string, string> {
    try {
      const key = this.getEncryptionKey();
      const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(data.iv, 'hex'));
      decipher.setAuthTag(Buffer.from(data.authTag, 'hex'));

      let decrypted = decipher.update(data.content, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return JSON.parse(decrypted);
    } catch (error) {
      logger.error('Decryption failed', error);
      // Return empty object on corruption or key mismatch to avoid crashing
      // User will see empty envs and can re-save
      return {};
    }
  }

  /**
   * Get decrypted environment variables for a project
   */
  async getEnv(projectId: string): Promise<Record<string, string>> {
     const envPath = this.getEnvPath(projectId);
     if (!await fs.pathExists(envPath)) {
       return {};
     }

     try {
       const raw = await fs.readJson(envPath);
       return this.decrypt(raw);
     } catch (error) {
       logger.error(`Failed to read/decrypt env for ${projectId}`, error);
       return {};
     }
  }

  /**
   * Set and encrypt environment variables
   */
  async setEnv(projectId: string, env: Record<string, string>): Promise<void> {
    const envPath = this.getEnvPath(projectId);
    
    // Validate project existence
    if (!await fs.pathExists(path.dirname(envPath))) {
      throw new AppError('Project directory not found', 404);
    }

    const encryptedData = this.encrypt(env);
    await fs.writeJson(envPath, encryptedData, { spaces: 2 });
  }

  /**
   * Apply environment variables to the running project
   */
  async applyEnv(projectId: string): Promise<void> {
    const project = await projectRegistry.getById(projectId);
    if (!project) {
      throw new AppError('Project not found', 404);
    }

    const env = await this.getEnv(projectId);

    if (project.type === 'react') {
      // For React, rebuild with new environment variables
      // This ensures import.meta.env.VITE_* gets the correct values at build time
      logger.info(`Rebuilding React project ${project.name} with new environment variables...`);
      await this.rebuildReactProject(project, env);
      logger.info(`✅ React project ${project.name} rebuilt successfully with new environment variables`);
    } else {
      // For Node/Next, we must restart the process to inject new envs
      // PM2 service uses envService.getEnv() (which we need to swap) or we pass it explicit
      // We'll update PM2Service to accept explicit env or use EnvManager

      // Current pm2Service implementation relies on `envService.getEnv` inside `generateEcosystemConfig`
      // We should probably update that call in pm2Service first.
      // But we can trigger a restart:
      await pm2Service.restartProject(project.id);
      logger.info(`Restarted ${project.name} to apply environment variables`);
    }
  }

  /**
   * Rebuild a React project with new environment variables
   * This bakes the env vars into the build via import.meta.env.VITE_*
   */
  private async rebuildReactProject(project: ProjectConfig, env: Record<string, string>): Promise<void> {
    const projectDir = path.join(process.cwd(), '../apps', project.id);

    // Check if project directory exists
    if (!await fs.pathExists(projectDir)) {
      throw new AppError('Project directory not found', 404);
    }

    // Check if package.json has build script
    const pkgJsonPath = path.join(projectDir, 'package.json');
    if (!await fs.pathExists(pkgJsonPath)) {
      throw new AppError('package.json not found', 404);
    }

    const pkgJson = await fs.readJson(pkgJsonPath);
    if (!pkgJson.scripts || !pkgJson.scripts.build) {
      throw new AppError('No build script found in package.json', 400);
    }

    // Determine build command with base path
    const safeName = project.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const basePath = `/app/${safeName}`;

    let buildCmd = `${project.pkgManager} run build`;
    if (project.pkgManager === 'npm') {
      buildCmd += ` -- --base=${basePath}`;
    } else {
      buildCmd += ` --base=${basePath}`;
    }

    // Execute build with environment variables
    try {
      logger.info(`Running: ${buildCmd}`);
      const { stdout, stderr } = await execAsync(buildCmd, {
        cwd: projectDir,
        env: { ...process.env, ...env },
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });

      if (stdout) logger.debug('Build output:', stdout);
      if (stderr) logger.warn('Build warnings:', stderr);

      logger.info('✅ React project rebuilt successfully');
    } catch (error: any) {
      logger.error('Build failed', {
        command: buildCmd,
        error: error.message,
        stdout: error.stdout,
        stderr: error.stderr
      });
      throw new AppError(`Rebuild failed: ${error.stderr || error.message}`, 500);
    }
  }
}

export const envManager = new EnvManager();
