import fs from 'fs-extra';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import { ProjectConfig } from '@pdcp/shared';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import { BuildDetector } from './buildDetector';

const execAsync = util.promisify(exec);

const APPS_DIR = path.resolve(process.cwd(), '../apps');
const CADDY_DIR = process.env.CADDY_CONFIG_DIR || path.resolve(process.cwd(), '../data/caddy');
const CADDYFILE_PATH = path.join(CADDY_DIR, 'Caddyfile');
const SITES_DIR = path.join(CADDY_DIR, 'sites');

export class CaddyConfigManager {
  /**
   * Initialize Caddy directory structure and main Caddyfile
   * Call this once during server startup
   */
  async initialize(): Promise<void> {
    try {
      // Ensure directories exist
      await fs.ensureDir(CADDY_DIR);
      await fs.ensureDir(SITES_DIR);

      // Get UI dist path for control panel
      const uiDist = path.resolve(process.cwd(), '../ui/dist');

      // Create main Caddyfile with imports
      const mainConfig = `
{
  # Global options
  admin off
}

# Control Panel UI
:80 {
  # 1. API Routes: High Priority
  handle /api/* {
    reverse_proxy 127.0.0.1:3000
  }
  
  # 2. WebSocket
  handle /socket.io/* {
    reverse_proxy 127.0.0.1:3000
  }

  # 3. Frontend SPA: Catch-all
  handle {
    root * ${uiDist}
    try_files {path} /index.html
    file_server
  }
}

# Import project-specific configurations
import ${SITES_DIR}/*.caddy
`.trim();

      await fs.writeFile(CADDYFILE_PATH, mainConfig);
      logger.info(`Initialized Caddy config at ${CADDYFILE_PATH}`);
      
      // Try to reload Caddy (don't fail if Caddy isn't running)
      try {
        await this.reloadCaddy();
      } catch (error) {
        logger.warn('Could not reload Caddy (may not be running yet)', error);
      }
    } catch (error) {
      logger.error('Failed to initialize Caddy config', error);
      throw new AppError('Caddy initialization failed', 500);
    }
  }

  /**
   * Generate and save Caddy configuration for a specific project
   * Creates a modular .caddy file in the sites/ directory
   */
  async updateProjectConfig(project: ProjectConfig): Promise<void> {
    try {
      const configPath = path.join(SITES_DIR, `${project.id}.caddy`);
      const config = await this.generateProjectConfig(project);

      await fs.writeFile(configPath, config);
      logger.info(`Updated Caddy config for ${project.name} at ${configPath}`);

      await this.reloadCaddy();
    } catch (error) {
      logger.error(`Failed to update Caddy config for ${project.name}`, error);
      throw new AppError('Failed to update Caddy configuration', 500);
    }
  }

  /**
   * Delete Caddy configuration for a project
   */
  async deleteProjectConfig(projectId: string): Promise<void> {
    try {
      const configPath = path.join(SITES_DIR, `${projectId}.caddy`);
      
      if (await fs.pathExists(configPath)) {
        await fs.remove(configPath);
        logger.info(`Deleted Caddy config for ${projectId}`);
        await this.reloadCaddy();
      }
    } catch (error) {
      logger.error(`Failed to delete Caddy config for ${projectId}`, error);
      // Don't throw - project deletion should continue even if Caddy cleanup fails
    }
  }

  /**
   * Generate Caddy configuration block for a single project
   */
  private async generateProjectConfig(project: ProjectConfig): Promise<string> {
    let config = '';
    const projectDir = path.join(APPS_DIR, project.id);

    // 1. Domain-based configuration (if domains are configured)
    if (project.domains && project.domains.length > 0) {
      for (const domain of project.domains) {
        if (project.type === 'react') {
          // Static site - serve files directly
          const buildPath = await BuildDetector.detectBuildOutput(projectDir, project.type);
          
          if (buildPath) {
            config += `
${domain} {
  root * ${buildPath}
  file_server
  try_files {path} /index.html
  
  # Enable compression
  encode gzip
  
  # Auto HTTPS (use 'tls internal' for local dev)
  tls internal
}
`;
          }
        } else {
          // Dynamic app - reverse proxy to PM2
          config += `
${domain} {
  reverse_proxy 127.0.0.1:${project.port}
  
  # Enable compression
  encode gzip
  
  # Auto HTTPS
  tls internal
}
`;
        }
      }
    }

    // 2. IP:Port fallback (always available)
    if (project.port) {
      if (project.type === 'react') {
        const buildPath = await BuildDetector.detectBuildOutput(projectDir, project.type);
        
        if (buildPath) {
          config += `
:${project.port} {
  root * ${buildPath}
  file_server
  try_files {path} /index.html
  encode gzip
}
`;
        }
      } else {
        // For Node/Next, bind to port and proxy
        config += `
:${project.port} {
  reverse_proxy 127.0.0.1:${project.port}
  encode gzip
}
`;
      }
    }

    return config.trim() + '\n';
  }

  /**
   * Reload Caddy configuration
   */
  private async reloadCaddy(): Promise<void> {
    try {
      const { stdout, stderr } = await execAsync(`caddy reload --config ${CADDYFILE_PATH}`);
      
      if (stderr && !stderr.includes('using provided configuration')) {
        logger.warn('Caddy reload warning:', stderr);
      }
      
      logger.info('Caddy configuration reloaded successfully');
    } catch (error) {
      logger.error('Failed to reload Caddy', error);
      throw new AppError('Failed to reload Caddy', 500);
    }
  }

  /**
   * Validate Caddy configuration without reloading
   */
  async validateConfig(): Promise<boolean> {
    try {
      await execAsync(`caddy validate --config ${CADDYFILE_PATH}`);
      return true;
    } catch (error) {
      logger.error('Caddy config validation failed', error);
      return false;
    }
  }

  /**
   * Get Caddy configuration file path for a project
   */
  getProjectConfigPath(projectId: string): string {
    return path.join(SITES_DIR, `${projectId}.caddy`);
  }

  /**
   * Check if Caddy is installed and running
   */
  async checkCaddyStatus(): Promise<{ installed: boolean; running: boolean }> {
    let installed = false;
    let running = false;

    try {
      await execAsync('caddy version');
      installed = true;
    } catch {
      installed = false;
    }

    try {
      await execAsync('caddy validate --config ' + CADDYFILE_PATH);
      running = true;
    } catch {
      running = false;
    }

    return { installed, running };
  }
}

export const caddyConfigManager = new CaddyConfigManager();
