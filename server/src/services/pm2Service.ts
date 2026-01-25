import pm2 from 'pm2';
import path from 'path';
import fs from 'fs-extra';
import util from 'util';
import { ProjectConfig } from '@pdcp/shared';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import { envService } from './envService';

// Promisify PM2 methods
const pm2Connect = util.promisify(pm2.connect);
const pm2Start = util.promisify(pm2.start);
const pm2Stop = util.promisify(pm2.stop);
const pm2Delete = util.promisify(pm2.delete);
const pm2Restart = util.promisify(pm2.restart);
const pm2Disconnect = util.promisify(pm2.disconnect);
const pm2List = util.promisify(pm2.list);

const APPS_DIR = path.resolve(process.cwd(), '../apps');

export class PM2Service {
  
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
      await pm2Connect();
      
      // Check if already running?
      const list = await pm2List();
      const exists = list.find((p: any) => p.name === project.id);

      if (exists) {
        await pm2Delete(project.id);
      }

      await pm2Start(config);
    } catch (error) {
      logger.error('PM2 start failed', error);
      throw new AppError('Failed to start process', 500);
    } finally {
      pm2.disconnect();
    }
  }

  async stopProject(projectId: string): Promise<void> {
    try {
      await pm2Connect();
      await pm2Stop(projectId);
    } catch (error) {
      // Ignore if not found
      logger.warn(`Failed to stop ${projectId}`, error);
    } finally {
      pm2.disconnect();
    }
  }

  async restartProject(projectId: string): Promise<void> {
    try {
      await pm2Connect();
      await pm2Restart(projectId);
    } catch (error) {
      logger.error(`Failed to restart ${projectId}`, error);
      throw new AppError('Failed to restart process', 500);
    } finally {
      pm2.disconnect();
    }
  }

  async deleteProject(projectId: string): Promise<void> {
    try {
      await pm2Connect();
      await pm2Delete(projectId);
    } catch (error) {
      logger.warn(`Failed to delete process ${projectId}`, error);
    } finally {
      pm2.disconnect();
    }
  }

  async getProcesses(): Promise<any[]> {
    try {
      await pm2Connect();
      const list = await pm2List();
      return list.map((p: any) => ({
        name: p.name,
        pid: p.pid,
        status: p.pm2_env.status,
        uptime: p.pm2_env.pm_uptime,
        cpu: p.monit.cpu,
        memory: p.monit.memory,
      }));
    } catch (error) {
      logger.error('Failed to list processes', error);
      return [];
    } finally {
      pm2.disconnect();
    }
  }

  async reconcile(projects: ProjectConfig[]): Promise<void> {
    logger.info('Reconciling PM2 processes...');
    try {
      await pm2Connect();
      const list = await pm2List();
      
      // Stop processes not in registry (optional, safety)
      // Start processes in registry that are missing
      
      for (const project of projects) {
        if (project.type === 'react') continue;

        const running = list.find((p: any) => p.name === project.id);
        if (!running) {
          logger.info(`Reviving process for ${project.name}`);
          await this.startProject(project); // This connects/disconnects internally, might be inefficient in loop but safe
        }
      }
    } catch (error) {
      logger.error('Reconciliation failed', error);
    } finally {
      pm2.disconnect();
    }
  }
}

export const pm2Service = new PM2Service();
