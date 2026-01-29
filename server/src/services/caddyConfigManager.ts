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

      // Verify the import directive exists in the main Caddyfile
      const caddyfileContent = await fs.readFile(CADDYFILE_PATH, 'utf8');
      if (!caddyfileContent.includes(`import ${SITES_DIR}/*.caddy`)) {
        logger.error('❌ Main Caddyfile is missing import directive!');
        throw new Error('Caddy initialization failed: import directive missing from main Caddyfile');
      }
      logger.info('✅ Verified main Caddyfile has import directive');

      // Force reload to ensure active config matches disk
      await this.reloadCaddy();

      logger.info('✅ Caddy configuration initialized');
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
      /* 
         Previous implementation manually read files and inlined them.
         This proved unreliable in some environments (fs.readdir returning empty).
         Switching to native Caddy import directive which handles globs robustly.
         Using absolute path to be safe.
      */
      const projectSection = `\n  # Deployed projects - Import all site configs\n  import ${SITES_DIR}/*.caddy`;

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
      // Self-healing: Check if import directive is missing and regenerate if needed
      const caddyfileContent = await fs.readFile(CADDYFILE_PATH, 'utf8');
      if (!caddyfileContent.includes('import')) {
        logger.warn('⚠️ Main Caddyfile missing import directive, regenerating...');
        await this.updateMainCaddyfile();
      }

      // Validate first
      const isValid = await this.validateConfig();
      if (!isValid) {
        throw new Error('Caddy config validation failed');
      }

      // Tier 1: Caddy Admin API (Preferred - Graceful, keeps connections)
      try {
        // Use correct Content-Type (text/caddyfile) and --data-binary to preserve formatting
        // -s: Silent (no progress)
        // -w: Write HTTP code at end
        // -X POST: Explicit method
        const curlCommand = `curl -s -w "\\nHTTP_CODE:%{http_code}" -X POST "http://localhost:2019/load" -H "Content-Type: text/caddyfile" --data-binary @${CADDYFILE_PATH}`;
        
        const { stdout, stderr } = await execAsync(curlCommand);
        
        // Parse response - format is: <response body>\nHTTP_CODE:<code>
        const lines = stdout.trim().split('\n');
        const lastLine = lines[lines.length - 1];
        const httpCodeMatch = lastLine.match(/HTTP_CODE:(\d+)/);
        const httpCode = httpCodeMatch ? httpCodeMatch[1] : null;
        const responseBody = lines.slice(0, -1).join('\n'); // Everything else is body
        
        if (httpCode === '200') {
          logger.info('✅ Caddy reloaded gracefully via API');
          return; // Success - exit early
        } else {
          // API call failed logically
          logger.warn(`Caddy API returned HTTP ${httpCode}`, {
            responseBody: responseBody.substring(0, 200), // Log partial body
            stderr: stderr
          });
          throw new Error(`Caddy API returned ${httpCode}`);
        }
      } catch (apiError: any) {
        // Tier 2: Systemctl Reload (Graceful, Service-Aware)
        logger.warn('Caddy API reload failed, falling back to systemctl reload', {
          error: apiError.message
        });
        
        try {
          const { stdout, stderr } = await execAsync('sudo systemctl reload caddy');
          
          if (stderr) logger.warn('Systemctl reload stderr:', stderr);
          if (stdout) logger.debug('Systemctl reload stdout:', stdout);
          
          logger.info('✅ Caddy configuration reloaded via systemctl');
          return; // Success
        } catch (systemctlError: any) {
          // Tier 3: Caddy CLI (Last Resort - Might restart process)
          logger.warn('Systemctl reload failed, trying caddy reload command', {
            error: systemctlError.message
          });
          
          // Use --config to be explicit, but strictly we prefer systemctl
          const { stdout, stderr } = await execAsync(
            `sudo caddy reload --config ${CADDYFILE_PATH}`
          );
          
          if (stderr && !stderr.includes('using provided configuration')) {
            logger.warn('Caddy CLI reload stderr:', stderr);
          }
          
          logger.info('✅ Caddy configuration reloaded via CLI');
        }
      }
    } catch (error: any) {
      logger.error('Failed to reload Caddy - all methods exhausted', {
        message: error.message,
        stderr: error.stderr,
        stdout: error.stdout,
        code: error.code
      });
      // We throw here because deploy/start operations essentially failed if proxy isn't updated
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