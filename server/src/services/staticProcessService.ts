import path from 'path';
import fs from 'fs-extra';
import { ProjectConfig } from '@pdcp/shared';
import { logger } from '../utils/logger';
import { caddyConfigManager } from './caddyConfigManager';
import { AppError } from '../middleware/errorHandler';
import { projectRegistry } from './projectRegistry';
import { eventBus } from '../events/eventBus';
import { activityLogger } from './activityLogger';

export class StaticProcessService {
  
  /**
   * "Start" a static project by generating its Caddy configuration
   */
  async startProject(project: ProjectConfig): Promise<void> {
    try {
      logger.info(`Starting static project ${project.name} (${project.id})`);
      
      // Update/Create the Caddy configuration
      await caddyConfigManager.updateProjectConfig(project);
      
      // Log activity
      await activityLogger.log('start', project.name, 'Service started');
      
      // Emit event
      eventBus.emitEvent('process:change', {
        projectId: project.id,
        status: 'running'
      });
      
    } catch (error) {
      logger.error(`Failed to start static project ${project.id}`, error);
      throw new AppError('Failed to start static service', 500);
    }
  }

  /**
   * "Stop" a static project by removing its Caddy configuration
   */
  async stopProject(projectId: string): Promise<void> {
    try {
      logger.info(`Stopping static project ${projectId}`);
      
      // Delete the Caddy configuration
      await caddyConfigManager.deleteProjectConfig(projectId);
      
      const project = await projectRegistry.getById(projectId);
      if (project) {
        await activityLogger.log('stop', project.name, 'Service stopped');
      }
      
      // Emit event
      eventBus.emitEvent('process:change', {
        projectId,
        status: 'stopped'
      });
      
    } catch (error) {
      logger.error(`Failed to stop static project ${projectId}`, error);
      throw new AppError('Failed to stop static service', 500);
    }
  }

  /**
   * Update runtime configuration for React projects
   * Generates env-config.js and patches index.html
   */
  async updateRuntimeConfig(project: ProjectConfig, env: Record<string, string>): Promise<void> {
    try {
      const distDir = path.join(process.cwd(), '../apps', project.id, 'dist');

      // Derive the base path from project name (same logic as deployment)
      const safeName = project.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
      const basePath = `/app/${safeName}`;

      // 1. Generate env-config.js
      // Make runtime env accessible via both window._env_ and import.meta.env
      const envConfigPath = path.join(distDir, 'env-config.js');
      const envContent = `// Runtime environment configuration
window._env_ = ${JSON.stringify(env, null, 2)};

// Bridge to make runtime env accessible as import.meta.env for Vite apps
if (typeof window !== 'undefined' && !window.import) {
  window.import = { meta: { env: window._env_ } };
}
`;
      await fs.writeFile(envConfigPath, envContent);

      // 2. Patch index.html if needed
      const indexPath = path.join(distDir, 'index.html');
      if (await fs.pathExists(indexPath)) {
        let indexContent = await fs.readFile(indexPath, 'utf-8');

        if (!indexContent.includes('env-config.js')) {
          // Insert inside head, or before title, or simply before first script
          // Safest generic place is end of head
          // Use absolute base path to work with SPA client-side routing
          const envScript = `<script src="${basePath}/env-config.js"></script>`;
          if (indexContent.includes('</head>')) {
            indexContent = indexContent.replace('</head>', `${envScript}\n</head>`);
          } else {
            // Fallback: prepend to body
            indexContent = indexContent.replace('<body>', `<body>\n${envScript}`);
          }

          await fs.writeFile(indexPath, indexContent);
          logger.info(`Patched index.html for ${project.name} with base path ${basePath}`);
        }
      }
    } catch (error) {
      logger.error(`Failed to update runtime config for ${project.name}`, error);
      throw new AppError('Failed to update runtime configuration', 500);
    }
  }

  /**
   * Get status of all static projects based on Caddy config existence
   */
  async getProcesses(projects: ProjectConfig[]): Promise<any[]> {
    const staticProcesses: any[] = [];
    
    for (const project of projects) {
      if (project.type !== 'react') continue;

      const configPath = caddyConfigManager.getProjectConfigPath(project.id);
      const isRunning = await fs.pathExists(configPath);
      
      staticProcesses.push({
        name: project.id, // Match PM2 format (uses ID as name)
        pid: 0, // No PID for static sites
        status: isRunning ? 'online' : 'stopped',
        uptime: 0, // Not applicable
        cpu: 0,
        memory: 0
      });
    }
    
    return staticProcesses;
  }
}

export const staticProcessService = new StaticProcessService();
