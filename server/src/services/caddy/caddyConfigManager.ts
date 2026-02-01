import fs from 'fs-extra';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import { ProjectConfig } from '@runway/shared';
import { logger } from '../../utils/logger';
import { AppError } from '../../middleware/errorHandler';
import { BuildDetector } from '../buildDetector';
import { renderTemplate } from './templateLoader';

const execAsync = util.promisify(exec);

const APPS_DIR = path.resolve(process.cwd(), '../apps');
const CADDY_DATA_DIR = '/opt/runway/data/caddy';
const CADDYFILE_PATH = path.join(CADDY_DATA_DIR, 'Caddyfile');
const SITES_DIR = path.join(CADDY_DATA_DIR, 'sites');
const SYSTEM_CADDY_PATH = path.join(CADDY_DATA_DIR, 'system.caddy');
const API_PORT = String(process.env.PORT || 3000);

export class CaddyConfigManager {
  /**
   * Initialize Caddy directory structure and main Caddyfile
   * Call this once during server startup
   */
  async initialize(): Promise<void> {
    try {
      await fs.ensureDir(SITES_DIR);
      logger.info(`Caddy sites directory ready at ${SITES_DIR}`);

      await this.updateMainCaddyfile();

      const caddyfileContent = await fs.readFile(CADDYFILE_PATH, 'utf8');
      if (!caddyfileContent.includes(`import ${SITES_DIR}/*.caddy`)) {
        logger.error('Main Caddyfile is missing import directive!');
        throw new Error('Caddy initialization failed: import directive missing from main Caddyfile');
      }
      logger.info('Verified main Caddyfile has import directive');

      await this.reloadCaddy();
      logger.info('Caddy configuration initialized');
    } catch (error) {
      logger.error('Failed to initialize Caddy config', error);
      throw new AppError('Caddy initialization failed', 500);
    }
  }

  /**
   * Generate and save Caddy configuration for a specific project
   */
  async updateProjectConfig(project: ProjectConfig): Promise<void> {
    try {
      const configPath = path.join(SITES_DIR, `${project.id}.caddy`);
      const config = await this.generateProjectConfig(project);

      await fs.writeFile(configPath, config);
      logger.info(`Updated Caddy config for ${project.name} at ${configPath}`);

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
      const mainConfig = await renderTemplate('main-caddyfile', {
        API_PORT,
        SITES_DIR,
      });

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

        await this.updateMainCaddyfile();
        await this.reloadCaddy();
      }
    } catch (error) {
      logger.error(`Failed to delete Caddy config for ${projectId}`, error);
    }
  }

  /**
   * Generate Caddy configuration block for a single project
   */
  private async generateProjectConfig(project: ProjectConfig): Promise<string> {
    const configs: string[] = [];
    const projectDir = path.join(APPS_DIR, project.id);

    const projectWithServeDir = project as ProjectConfig & { serveDir?: string };
    const hasServeDir = !!projectWithServeDir.serveDir;
    const isStaticProject = project.type === 'react' || project.type === 'static' || hasServeDir;

    const getBuildPath = async (): Promise<string | null> => {
      if (hasServeDir) {
        return path.join(projectDir, projectWithServeDir.serveDir!);
      }
      if (project.type === 'static') {
        return projectDir;
      }
      if (project.type === 'react') {
        return BuildDetector.detectBuildOutput(projectDir, project.type);
      }
      return null;
    };

    // 1. Domain-based configuration
    if (project.domains && project.domains.length > 0) {
      for (const domain of project.domains) {
        if (isStaticProject) {
          const buildPath = await getBuildPath();
          if (buildPath) {
            const domainConfig = await renderTemplate('project-static-domain', {
              domain,
              buildPath,
            });
            configs.push(domainConfig);
          }
        } else {
          const domainConfig = await renderTemplate('project-dynamic-domain', {
            domain,
            port: String(project.port),
          });
          configs.push(domainConfig);
        }
      }
    }

    // 2. Path-based routing (always available, for IP access)
    const projectPath = `/app/${project.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

    if (isStaticProject) {
      const buildPath = await getBuildPath();
      if (buildPath) {
        const pathConfig = await renderTemplate('project-static-path', {
          projectPath,
          buildPath,
        });
        configs.push(pathConfig);
      }
    } else {
      const pathConfig = await renderTemplate('project-dynamic-path', {
        projectPath,
        port: String(project.port),
      });
      configs.push(pathConfig);
    }

    return configs.join('\n').trim();
  }

  /**
   * Reload Caddy configuration
   */
  private async reloadCaddy(): Promise<void> {
    try {
      const caddyfileContent = await fs.readFile(CADDYFILE_PATH, 'utf8');
      if (!caddyfileContent.includes('import')) {
        logger.warn('Main Caddyfile missing import directive, regenerating...');
        await this.updateMainCaddyfile();
      }

      const isValid = await this.validateConfig();
      if (!isValid) {
        throw new Error('Caddy config validation failed');
      }

      // Tier 1: Caddy Admin API
      try {
        const curlCommand = `curl -s -w "\\nHTTP_CODE:%{http_code}" -X POST "http://localhost:2019/load" -H "Content-Type: text/caddyfile" --data-binary @${CADDYFILE_PATH}`;
        const { stdout, stderr } = await execAsync(curlCommand);

        const lines = stdout.trim().split('\n');
        const lastLine = lines[lines.length - 1];
        const httpCodeMatch = lastLine.match(/HTTP_CODE:(\d+)/);
        const httpCode = httpCodeMatch ? httpCodeMatch[1] : null;
        const responseBody = lines.slice(0, -1).join('\n');

        if (httpCode === '200') {
          logger.info('Caddy reloaded gracefully via API');
          return;
        } else {
          logger.warn(`Caddy API returned HTTP ${httpCode}`, {
            responseBody: responseBody.substring(0, 200),
            stderr,
          });
          throw new Error(`Caddy API returned ${httpCode}`);
        }
      } catch (apiError: unknown) {
        // Tier 2: Systemctl Reload
        logger.warn('Caddy API reload failed, falling back to systemctl reload', {
          error: apiError instanceof Error ? apiError.message : String(apiError),
        });

        try {
          const { stdout, stderr } = await execAsync('sudo systemctl reload caddy');
          if (stderr) logger.warn('Systemctl reload stderr:', stderr);
          if (stdout) logger.debug('Systemctl reload stdout:', stdout);
          logger.info('Caddy configuration reloaded via systemctl');
          return;
        } catch (systemctlError: unknown) {
          // Tier 3: Caddy CLI
          logger.warn('Systemctl reload failed, trying caddy reload command', {
            error: systemctlError instanceof Error ? systemctlError.message : String(systemctlError),
          });

          const { stdout, stderr } = await execAsync(`sudo caddy reload --config ${CADDYFILE_PATH}`);
          if (stderr && !stderr.includes('using provided configuration')) {
            logger.warn('Caddy CLI reload stderr:', stderr);
          }
          logger.info('Caddy configuration reloaded via CLI');
        }
      }
    } catch (error: unknown) {
      const err = error as { message?: string; stderr?: string; stdout?: string; code?: string };
      logger.error('Failed to reload Caddy - all methods exhausted', {
        message: err.message,
        stderr: err.stderr,
        stdout: err.stdout,
        code: err.code,
      });
      throw new AppError('Failed to reload Caddy', 500);
    }
  }

  /**
   * Validate Caddy configuration without reloading
   */
  async validateConfig(): Promise<boolean> {
    try {
      const { stdout, stderr } = await execAsync(`caddy validate --config ${CADDYFILE_PATH} 2>&1`);
      const output = (stdout + stderr).toLowerCase();
      if (output.includes('error')) {
        logger.error('Caddy validation failed:', stdout + stderr);
        return false;
      }
      return true;
    } catch (error: unknown) {
      const err = error as { message?: string; stdout?: string; stderr?: string };
      logger.error('Caddy config validation failed:', {
        message: err.message,
        output: err.stdout || err.stderr,
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

  /**
   * Update system domain configuration for the control panel
   */
  async updateSystemConfig(domain: string): Promise<void> {
    try {
      logger.info(`Configuring system domain: ${domain}`);

      const systemConfig = await renderTemplate('system-domain', {
        domain,
        API_PORT,
        SITES_DIR,
      });

      await fs.writeFile(SYSTEM_CADDY_PATH, systemConfig);
      logger.info(`System Caddy config written to ${SYSTEM_CADDY_PATH}`);

      await this.updateMainCaddyfileWithSystem(domain);
      await this.reloadCaddy();

      logger.info(`System domain ${domain} configured with HTTPS`);
    } catch (error) {
      logger.error(`Failed to configure system domain ${domain}`, error);
      throw new AppError('Failed to configure system domain', 500);
    }
  }

  /**
   * Remove system domain configuration
   */
  async removeSystemConfig(): Promise<void> {
    try {
      if (await fs.pathExists(SYSTEM_CADDY_PATH)) {
        await fs.remove(SYSTEM_CADDY_PATH);
        logger.info('Removed system Caddy config');
      }

      await this.updateMainCaddyfile();
      await this.reloadCaddy();

      logger.info('System domain configuration removed');
    } catch (error) {
      logger.error('Failed to remove system domain config', error);
      throw new AppError('Failed to remove system domain config', 500);
    }
  }

  /**
   * Update main Caddyfile to include system config when domain is set
   */
  private async updateMainCaddyfileWithSystem(domain: string): Promise<void> {
    try {
      const mainConfig = await renderTemplate('main-with-system', {
        API_PORT,
        SITES_DIR,
        SYSTEM_CADDY_PATH,
      });

      await fs.writeFile(CADDYFILE_PATH, mainConfig);
      logger.info('Updated main Caddyfile with system domain import');
    } catch (error) {
      logger.error('Failed to update main Caddyfile with system config', error);
      throw error;
    }
  }

  /**
   * Check if system domain is configured
   */
  async hasSystemDomain(): Promise<boolean> {
    return fs.pathExists(SYSTEM_CADDY_PATH);
  }
}

export const caddyConfigManager = new CaddyConfigManager();
