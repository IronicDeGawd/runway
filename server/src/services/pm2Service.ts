import pm2 from 'pm2';
import path from 'path';
import fs from 'fs-extra';
import { ProjectConfig } from '@runway/shared';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import { envManager } from './envManager';
import { activityLogger } from './activityLogger';
import { projectRegistry } from './projectRegistry';
import { eventBus } from '../events/eventBus';

const APPS_DIR = path.resolve(process.cwd(), '../apps');

export class PM2Service {
  // Track connection state to prevent race conditions
  private connected = false;

  // Private helpers to wrap PM2 callbacks in Promises correctly

  private async connect(): Promise<void> {
    // Skip if already connected to prevent overlapping connections
    if (this.connected) {
      return;
    }

    return new Promise((resolve, reject) => {
      pm2.connect((err: any) => {
        if (err) return reject(err);
        this.connected = true;
        resolve();
      });
    });
  }

  private async disconnect(): Promise<void> {
    // Skip if not connected
    if (!this.connected) {
      return;
    }

    pm2.disconnect();
    this.connected = false;

    // Small delay to ensure cleanup completes before next connection
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  private list(): Promise<any[]> {
    return new Promise((resolve, reject) => {
      pm2.list((err: any, processList: any[]) => {
        if (err) return reject(err);
        resolve(processList);
      });
    });
  }

  private start(config: any): Promise<void> {
    return new Promise((resolve, reject) => {
      pm2.start(config, (err: any, proc: any) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  private stop(process: string | number): Promise<void> {
    return new Promise((resolve, reject) => {
      pm2.stop(process, (err: any) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  private delete(process: string | number): Promise<void> {
    return new Promise((resolve, reject) => {
      pm2.delete(process, (err: any) => {
        if (err) {
          // Ignore 'process not found' errors
          if (err.message && err.message.includes('process or namespace not found')) {
            return resolve();
          }
          return reject(err);
        }
        resolve();
      });
    });
  }

  private restart(process: string | number): Promise<void> {
    return new Promise((resolve, reject) => {
      pm2.restart(process, (err: any) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  private async generateEcosystemConfig(project: ProjectConfig): Promise<any> {
    const projectDir = path.join(APPS_DIR, project.id);
    const envVars = await envManager.getEnv(project.id);
    
    // Determine entry point
    let script = 'index.js';
    if (project.type === 'next') {
      script = 'npm'; // For Next.js we usually run 'npm start'
    } else {
      // For Node, check package.json "main" or "scripts.start"
      // We'll assume npm start for simplicity or try to find main.
      // But 'npm start' is safest if defined.
      script = 'npm';
    }

    return {
      name: project.id, // Use ID as PM2 name for uniqueness
      cwd: projectDir,
      script: script,
      args: script === 'npm' ? 'start' : [],
      env: {
        PORT: project.port,
        NODE_ENV: 'production',
        ...envVars,
      },
      // Logs with rotation to prevent disk exhaustion
      output: path.join(projectDir, 'logs', 'out.log'),
      error: path.join(projectDir, 'logs', 'error.log'),
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      // PM2 log rotation settings (requires pm2-logrotate module)
      // These settings are used if pm2-logrotate is installed
      max_size: '10M',    // Rotate when file exceeds 10MB
      retain: 5,          // Keep only 5 rotated files
      compress: true,     // Compress rotated files
      // Memory and restart limits
      max_memory_restart: '500M',  // Restart if memory exceeds 500MB
      max_restarts: 10,            // Allow more restarts before giving up
      min_uptime: '10s',           // Min uptime to consider "successfully started"
      restart_delay: 5000,         // Wait 5 seconds between restarts
    };
  }

  async startProject(project: ProjectConfig): Promise<void> {
    if (project.type === 'react' || project.type === 'static') {
      logger.info(`Skipping PM2 start for static project ${project.name}`);
      return;
    }

    logger.info(`Starting project ${project.name} (${project.id}) on port ${project.port}`);

    // Ensure log directory exists
    await fs.ensureDir(path.join(APPS_DIR, project.id, 'logs'));

    const config = await this.generateEcosystemConfig(project);

    try {
      await this.connect();
      
      // Check if already running
      const list = await this.list();
      const exists = list.find((p: any) => p.name === project.id);

      if (exists) {
        await this.delete(project.id);
      }

      await this.start(config);
      
      // Log activity
      await activityLogger.log('start', project.name, 'Service started');
      
      // Emit event for realtime updates
      eventBus.emitEvent('process:change', {
        projectId: project.id,
        status: 'running'
      });
    } catch (error) {
      logger.error('PM2 start failed', error);
      
      // Emit failed status
      eventBus.emitEvent('process:change', {
        projectId: project.id,
        status: 'failed'
      });
      
      throw new AppError(`Failed to start process: ${error}`, 500);
    } finally {
      await this.disconnect();
    }
  }

  async stopProject(projectId: string): Promise<void> {
    try {
      await this.connect();
      await this.stop(projectId);
      
      // Log activity
      const project = await projectRegistry.getById(projectId);
      if (project) {
        await activityLogger.log('stop', project.name, 'Service stopped');
      }
      
      // Emit event for realtime updates
      eventBus.emitEvent('process:change', {
        projectId,
        status: 'stopped'
      });
    } catch (error) {
      // Ignore if not found
      logger.warn(`Failed to stop ${projectId}`, error);
    } finally {
      await this.disconnect();
    }
  }

  async restartProject(projectId: string): Promise<void> {
    try {
      await this.connect();
      await this.restart(projectId);
      
      // Emit event for realtime updates
      eventBus.emitEvent('process:change', {
        projectId,
        status: 'running'
      });
    } catch (error) {
      logger.error(`Failed to restart ${projectId}`, error);
      
      // Emit failed status
      eventBus.emitEvent('process:change', {
        projectId,
        status: 'failed'
      });
      
      throw new AppError('Failed to restart process', 500);
    } finally {
      await this.disconnect();
    }
  }

  /**
   * Restart a project with new environment variables.
   * Unlike restartProject(), this properly reloads env vars by deleting
   * and re-starting the process with a freshly generated config.
   */
  async restartWithNewEnv(projectId: string): Promise<void> {
    const project = await projectRegistry.getById(projectId);
    if (!project) {
      throw new AppError('Project not found for restart', 404);
    }

    if (project.type === 'react') {
      logger.info(`Skipping PM2 restart for static React project ${project.name}`);
      return;
    }

    logger.info(`Restarting ${project.name} with new environment variables...`);

    try {
      await this.connect();

      // Delete existing process to clear old environment
      await this.delete(projectId);

      // Ensure log directory exists
      const projectDir = path.join(APPS_DIR, project.id, 'logs');
      await fs.ensureDir(projectDir);

      // Regenerate config with fresh env vars from envManager
      const config = await this.generateEcosystemConfig(project);

      // Start with new config (includes updated env vars)
      await this.start(config);

      // Log activity
      await activityLogger.log('config', project.name, 'Environment variables updated and applied');

      eventBus.emitEvent('process:change', {
        projectId,
        status: 'running'
      });

      logger.info(`Successfully restarted ${project.name} with new environment variables`);
    } catch (error) {
      logger.error(`Failed to restart ${projectId} with new env`, error);

      eventBus.emitEvent('process:change', {
        projectId,
        status: 'failed'
      });

      throw new AppError('Failed to restart process with new environment', 500);
    } finally {
      this.disconnect();
    }
  }

  async deleteProject(projectId: string): Promise<void> {
    try {
      await this.connect();
      
      // Log activity before deleting
      const project = await projectRegistry.getById(projectId);
      if (project) {
        await activityLogger.log('delete', project.name, 'Project deleted');
      }
      
      await this.delete(projectId);
    } catch (error) {
      logger.warn(`Failed to delete process ${projectId}`, error);
    } finally {
      await this.disconnect();
    }
  }

  async getProcesses(): Promise<any[]> {
    try {
      await this.connect();
      const list = await this.list();
      return list.map((p: any) => ({
        name: p.name,
        pid: p.pid,
        status: p.pm2_env.status,
        uptime: Date.now() - p.pm2_env.pm_uptime,
        cpu: p.monit.cpu,
        memory: p.monit.memory,
      }));
    } catch (error: any) {
      logger.error('Failed to list processes:', error?.message || error);
      return [];
    } finally {
      await this.disconnect();
    }
  }

  async reconcile(projects: ProjectConfig[]): Promise<void> {
    logger.info('Reconciling PM2 processes...');

    // Collect projects that need to be started
    const projectsToStart: ProjectConfig[] = [];

    try {
      await this.connect();
      const list = await this.list();

      for (const project of projects) {
        if (project.type === 'react' || project.type === 'static') continue;

        const running = list.find((p: any) => p.name === project.id);
        if (!running) {
          logger.info(`Will revive process for ${project.name}`);
          projectsToStart.push(project);
        }
      }
    } catch (error: any) {
      logger.error('Reconciliation check failed:', error?.message || error);
    } finally {
      await this.disconnect();
    }

    // Start projects sequentially outside of the main connection
    // This avoids the disconnect/reconnect churn inside the loop
    for (const project of projectsToStart) {
      try {
        logger.info(`Reviving process for ${project.name}`);
        await this.startProject(project);
      } catch (error: any) {
        logger.error(`Failed to revive ${project.name}:`, error?.message || error);
      }
    }

    if (projectsToStart.length > 0) {
      logger.info(`Reconciliation complete: ${projectsToStart.length} processes revived`);
    }
  }
}

export const pm2Service = new PM2Service();

