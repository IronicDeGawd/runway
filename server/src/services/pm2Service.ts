import pm2 from 'pm2';
import path from 'path';
import fs from 'fs-extra';
import { ProjectConfig } from '@pdcp/shared';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import { envService } from './envService';
import { activityLogger } from './activityLogger';
import { projectRegistry } from './projectRegistry';
import { eventBus } from '../events/eventBus';

const APPS_DIR = path.resolve(process.cwd(), '../apps');

export class PM2Service {
  
  // Private helpers to wrap PM2 callbacks in Promises correctly
  
  private connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      pm2.connect((err: any) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  private disconnect(): void {
    pm2.disconnect();
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
    const envVars = await envService.getEnv(project.id);
    
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
      // Logs
      output: path.join(projectDir, 'logs', 'out.log'),
      error: path.join(projectDir, 'logs', 'error.log'),
      merge_logs: true,
    };
  }

  async startProject(project: ProjectConfig): Promise<void> {
    if (project.type === 'react') {
      logger.info(`Skipping PM2 start for static React project ${project.name}`);
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
      this.disconnect();
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
      this.disconnect();
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
      this.disconnect();
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
        uptime: p.pm2_env.pm_uptime,
        cpu: p.monit.cpu,
        memory: p.monit.memory,
      }));
    } catch (error: any) {
      logger.error('Failed to list processes:', error?.message || error);
      return [];
    } finally {
      this.disconnect();
    }
  }

  async reconcile(projects: ProjectConfig[]): Promise<void> {
    logger.info('Reconciling PM2 processes...');
    try {
      await this.connect();
      const list = await this.list();
      
      for (const project of projects) {
        if (project.type === 'react') continue;

        const running = list.find((p: any) => p.name === project.id);
        if (!running) {
          logger.info(`Reviving process for ${project.name}`);
          // Note: startProject maintains its own connection cycle, so we shouldn't use it here if we want to stay connected.
          // However, since we're iterating and startProject is complex (logging/events), let's just use it and accept the re-connection overhead for now.
          // A better approach would be to extract the logic, but this is safer refactor-wise.
          // Ideally we should call this.start(config) here but we need to generate config first.
          
          this.disconnect(); // Disconnect current connection before calling startProject which makes a new one
          await this.startProject(project); 
          await this.connect(); // Reconnect for next iteration
        }
      }
    } catch (error: any) {
      logger.error('Reconciliation failed:', error?.message || error);
    } finally {
      this.disconnect();
    }
  }
}

export const pm2Service = new PM2Service();

