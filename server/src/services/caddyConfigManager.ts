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
// Use /opt/pdcp/data/caddy for configuration files (matches import path in Caddyfile)
const CADDY_DATA_DIR = '/opt/pdcp/data/caddy';
const CADDYFILE_PATH = '/etc/caddy/Caddyfile';
const SITES_DIR = path.join(CADDY_DATA_DIR, 'sites');

export class CaddyConfigManager {
  /**
   * Initialize Caddy directory structure and main Caddyfile
   * Call this once during server startup
   */
  async initialize(): Promise<void> {
    try {
      // Ensure sites directory exists (Caddyfile is managed by install.sh)
      await fs.ensureDir(SITES_DIR);
      logger.info(`Caddy sites directory ready at ${SITES_DIR}`);
    } catch (error) {
      logger.error('Failed to initialize Caddy sites directory', error);
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

      // Update main Caddyfile to include this project's snippet
      await this.updateMainCaddyfile();
      
      await this.reloadCaddy();
    } catch (error) {
      logger.error(`Failed to update Caddy config for ${project.name}`, error);
      throw new AppError('Failed to update Caddy configuration', 500);
    }
  }

  /**
   * Regenerate main Caddyfile with all active project imports
   */
  private async updateMainCaddyfile(): Promise<void> {
    try {
      // Get all project config files and import them directly
      const files = await fs.readdir(SITES_DIR);
      const projectFiles = files
        .filter(f => f.endsWith('.caddy'))
        .map(f => `${SITES_DIR}/${f}`);

      // Generate import statements - files contain handle_path blocks directly
      const projectImports = projectFiles.map(f => `  import ${f}`).join('\n');

      const mainConfig = `{
  admin off
  auto_https off
}

:80 {
  handle /api/* {
    reverse_proxy 127.0.0.1:3000 {
      transport http {
        read_timeout 5m
        write_timeout 5m
      }
    }
  }
  
${projectImports}
  
  handle {
    root * /opt/pdcp/ui/dist
    try_files {path} /index.html
    file_server
    encode gzip
  }
}
`;

      await fs.writeFile(CADDYFILE_PATH, mainConfig);
      logger.info('Updated main Caddyfile with active project imports');
    } catch (error) {
      logger.error('Failed to update main Caddyfile', error);
      throw error;
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
        
        // Update main Caddyfile to remove this project's import
        await this.updateMainCaddyfile();
        
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

    // Generate config snippet for path-based routing
    // Direct handler (not wrapped in snippet definition) so import works correctly
    const projectPath = `/app/${project.name}`;
    
    if (project.type === 'react') {
      const buildPath = await BuildDetector.detectBuildOutput(projectDir, project.type);
      
      if (buildPath) {
        config = `handle_path ${projectPath}* {
  root * ${buildPath}
  try_files {path} /index.html
  file_server
  encode gzip
}
`;
      }
    } else {
      // Node/Next apps - reverse proxy to PM2 process
      config = `handle_path ${projectPath}* {
  reverse_proxy 127.0.0.1:${project.port} {
    # Pass original path info to backend
    header_up X-Forwarded-Prefix ${projectPath}
    header_up X-Original-URI {uri}
  }
  encode gzip
}
`;
    }

    return config;
  }

  /**
   * Reload Caddy configuration
   */
  private async reloadCaddy(): Promise<void> {
    try {
      // Use systemctl since admin API is disabled
      const { stdout, stderr } = await execAsync('sudo systemctl restart caddy');
      
      if (stderr) {
        logger.warn('Caddy restart stderr:', stderr);
      }
      
      if (stdout) {
        logger.info('Caddy restart stdout:', stdout);
      }
      
      logger.info('Caddy configuration reloaded successfully');
    } catch (error: any) {
      logger.error('Failed to reload Caddy - Command error:', error.message);
      logger.error('Failed to reload Caddy - stderr:', error.stderr);
      logger.error('Failed to reload Caddy - stdout:', error.stdout);
      logger.error('Failed to reload Caddy - code:', error.code);
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
