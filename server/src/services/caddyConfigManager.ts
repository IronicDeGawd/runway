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
const CADDY_DATA_DIR = '/opt/pdcp/data/caddy';
const CADDYFILE_PATH = path.join(CADDY_DATA_DIR, 'Caddyfile');
const SITES_DIR = path.join(CADDY_DATA_DIR, 'sites');

export class CaddyConfigManager {
  /**
   * Initialize Caddy directory structure and main Caddyfile
   * Call this once during server startup
   */
  async initialize(): Promise<void> {
    try {
      // Ensure sites directory exists
      await fs.ensureDir(SITES_DIR);
      logger.info(`Caddy sites directory ready at ${SITES_DIR}`);
      
      // Regenerate main Caddyfile with current projects
      await this.updateMainCaddyfile();
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

      // Update main Caddyfile to include this project
      await this.updateMainCaddyfile();
      
      await this.reloadCaddy();
    } catch (error) {
      logger.error(`Failed to update Caddy config for ${project.name}`, error);
      throw new AppError('Failed to update Caddy configuration', 500);
    }
  }

  /**
   * Regenerate main Caddyfile with all active projects
   */
  private async updateMainCaddyfile(): Promise<void> {
    try {
      // Read all project config files with retry logic
      let files: string[] = [];
      let attempts = 0;
      const maxAttempts = 3;
      
      while (attempts < maxAttempts) {
        try {
          // Ensure directory exists first
          await fs.ensureDir(SITES_DIR);
          
          // Read directory contents
          files = await fs.readdir(SITES_DIR);
          
          // Success - break out of retry loop
          break;
        } catch (error: any) {
          attempts++;
          logger.warn(`Failed to read sites directory (attempt ${attempts}/${maxAttempts})`, {
            error: error.message,
            code: error.code
          });
          
          if (attempts >= maxAttempts) {
            // After max attempts, throw error instead of silently failing
            logger.error('Failed to read sites directory after retries - aborting Caddyfile update to prevent config corruption');
            throw new AppError(
              `Cannot read Caddy sites directory after ${maxAttempts} attempts: ${error.message}`,
              500
            );
          }
          
          // Wait before retry (exponential backoff: 100ms, 200ms, 400ms)
          await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempts - 1)));
        }
      }
      
      const projectHandlers: string[] = [];
      
      for (const file of files.filter(f => f.endsWith('.caddy'))) {
        try {
          const content = await fs.readFile(path.join(SITES_DIR, file), 'utf-8');
          // Each project config is already properly formatted
          projectHandlers.push(content.trim());
        } catch (error: any) {
          // Log error but continue with other files
          logger.error(`Failed to read project config file ${file}`, {
            error: error.message,
            code: error.code
          });
          // Don't add this file to the config, but continue processing others
        }
      }

      const projectSection = projectHandlers.length > 0 
        ? '\n  # Deployed projects\n  ' + projectHandlers.join('\n  \n  ')
        : '';

      const mainConfig = `{
  admin localhost:2019
  auto_https off
}

:80 {
  # WebSocket support for realtime updates
  @websocket_realtime {
    path /api/realtime*
  }
  handle @websocket_realtime {
    reverse_proxy 127.0.0.1:3000 {
      header_up Upgrade {http.request.header.Upgrade}
      header_up Connection {http.request.header.Connection}
      header_up Host {http.request.header.Host}
      header_up X-Real-IP {http.request.header.X-Real-IP}
      header_up X-Forwarded-For {http.request.header.X-Forwarded-For}
      header_up X-Forwarded-Proto {http.request.header.X-Forwarded-Proto}
    }
  }
  
  # WebSocket support for project logs
  @websocket_logs {
    path /api/logs/*
  }
  handle @websocket_logs {
    reverse_proxy 127.0.0.1:3000 {
      header_up Upgrade {http.request.header.Upgrade}
      header_up Connection {http.request.header.Connection}
      header_up Host {http.request.header.Host}
      header_up X-Real-IP {http.request.header.X-Real-IP}
      header_up X-Forwarded-For {http.request.header.X-Forwarded-For}
      header_up X-Forwarded-Proto {http.request.header.X-Forwarded-Proto}
    }
  }
  
  # Regular API requests
  handle /api/* {
    reverse_proxy 127.0.0.1:3000 {
      transport http {
        read_timeout 5m
        write_timeout 5m
      }
    }
  }
${projectSection}
  
  # Admin panel UI (fallback - must be last)
  handle {
    root * /opt/pdcp/ui/dist
    try_files {path} /index.html
    file_server
    encode gzip
  }
}
`;

      await fs.writeFile(CADDYFILE_PATH, mainConfig);
      logger.info('Updated main Caddyfile with active projects');
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
        
        // Update main Caddyfile to remove this project
        await this.updateMainCaddyfile();
        
        await this.reloadCaddy();
      }
    } catch (error) {
      logger.error(`Failed to delete Caddy config for ${projectId}`, error);
      // Don't throw - project deletion should continue
    }
  }

  /**
   * Generate Caddy configuration block for a single project
   * Supports both domain-based and path-based routing
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
# Domain: ${domain}
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
# Domain: ${domain}
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

    // 2. Path-based routing (always available, for IP access)
    // Generate config snippet that will be embedded in the main :80 block
    const projectPath = `/app/${project.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    
    if (project.type === 'react') {
      const buildPath = await BuildDetector.detectBuildOutput(projectDir, project.type);
      
      if (buildPath) {
        config += `handle_path ${projectPath}* {
    root * ${buildPath}
    try_files {path} /index.html
    file_server
    encode gzip
  }`;
      }
    } else {
      // Node/Next apps - reverse proxy to PM2 process
      config += `handle_path ${projectPath}* {
    reverse_proxy 127.0.0.1:${project.port} {
      # Pass original path info to backend
      header_up X-Forwarded-Prefix ${projectPath}
      header_up X-Original-URI {uri}
    }
    encode gzip
  }`;
    }

    return config.trim();
  }

  /**
   * Reload Caddy configuration
   */
  private async reloadCaddy(): Promise<void> {
    try {
      // Validate first
      const isValid = await this.validateConfig();
      if (!isValid) {
        throw new Error('Caddy config validation failed');
      }

      // Use Caddy's admin API for graceful reload (keeps WebSocket connections alive)
      // This is much better than systemctl restart or --force flag
      try {
        const { stdout, stderr } = await execAsync(
          `curl -X POST http://localhost:2019/load -H "Content-Type: application/json" -d @${CADDYFILE_PATH}`
        );
        
        if (stderr) {
          logger.warn('Caddy API reload stderr:', stderr);
        }
        
        if (stdout) {
          logger.debug('Caddy API reload stdout:', stdout);
        }
        
        logger.info('✅ Caddy configuration reloaded gracefully via API');
      } catch (apiError: any) {
        // Fallback to CLI reload if API fails
        logger.warn('Caddy API reload failed, falling back to CLI reload', apiError.message);
        
        const { stdout, stderr } = await execAsync(
          `sudo caddy reload --config ${CADDYFILE_PATH} --adapter caddyfile`
        );
        
        if (stderr && !stderr.includes('using provided configuration')) {
          logger.warn('Caddy CLI reload stderr:', stderr);
        }
        
        logger.info('✅ Caddy configuration reloaded via CLI');
      }
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
      const { stdout, stderr } = await execAsync(`caddy validate --config ${CADDYFILE_PATH} 2>&1`);
      
      // Check for errors in output
      const output = (stdout + stderr).toLowerCase();
      if (output.includes('error')) {
        logger.error('Caddy validation failed:', stdout + stderr);
        return false;
      }
      
      return true;
    } catch (error: any) {
      logger.error('Caddy config validation failed:', {
        message: error.message,
        output: error.stdout || error.stderr
      });
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

  /**
   * Get URL for accessing a deployed project
   */
  getProjectUrl(project: ProjectConfig, serverIp?: string): string {
    const ip = serverIp || 'localhost';
    const projectPath = `/app/${project.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    return `http://${ip}${projectPath}`;
  }
}

export const caddyConfigManager = new CaddyConfigManager();