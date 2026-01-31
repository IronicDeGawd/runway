import { ProjectConfig } from '@runway/shared';
import { pm2Service } from './pm2Service';
import { staticProcessService } from './staticProcessService';
import { projectRegistry } from './projectRegistry';
import { logger } from '../utils/logger';

export class ProcessManager {
  
  private isStaticProject(project: ProjectConfig): boolean {
    return project.type === 'react' || project.type === 'static';
  }

  async startProject(project: ProjectConfig): Promise<void> {
    if (this.isStaticProject(project)) {
      return staticProcessService.startProject(project);
    } else {
      return pm2Service.startProject(project);
    }
  }

  async stopProject(project: ProjectConfig): Promise<void> {
    if (this.isStaticProject(project)) {
      return staticProcessService.stopProject(project.id);
    } else {
      return pm2Service.stopProject(project.id);
    }
  }

  async restartProject(project: ProjectConfig): Promise<void> {
    if (this.isStaticProject(project)) {
      // For static sites, start ensures config is there and reloads Caddy.
      return staticProcessService.startProject(project);
    } else {
      return pm2Service.restartProject(project.id);
    }
  }

  async deleteProject(project: ProjectConfig): Promise<void> {
    if (this.isStaticProject(project)) {
      return staticProcessService.stopProject(project.id);
    } else {
      return pm2Service.deleteProject(project.id);
    }
  }

  /**
   * Get unified list of all processes (PM2 + Static)
   */
  async getProcesses(): Promise<any[]> {
    try {
      // 1. Get PM2 processes
      const pm2List = await pm2Service.getProcesses();
      
      // 2. Get Static processes
      const allProjects = await projectRegistry.getAll();
      const staticList = await staticProcessService.getProcesses(allProjects);
      
      // 3. Merge
      return [...pm2List, ...staticList];
    } catch (error) {
      logger.error('Failed to get unified process list', error);
      return [];
    }
  }

  /**
   * Reconcile process state (ensure what should be running is running)
   */
  async reconcile(): Promise<void> {
    const projects = await projectRegistry.getAll();
    
    // Split projects
    const pm2Projects = projects.filter(p => p.type !== 'react' && p.type !== 'static');
    const staticProjects = projects.filter(p => p.type === 'react' || p.type === 'static');

    // Reconcile PM2
    await pm2Service.reconcile(pm2Projects);

    // Reconcile Static (Ensure config files exist for all React projects? 
    // Or do we assume they persist? For now, we trust persistence but we could enforce it here)
    // For this iteration, we'll leave static reconciliation simple or skip it to avoid auto-starting "stopped" sites.
    // Unlike PM2 where "stopped" is a distinct state, for us "stopped" means file missing.
    // If we reconcile, we might accidentally restart something the user wanted stopped.
    // PM2 reconcile is about keeping the daemon in sync with the DB. 
    // Let's rely on Caddy persistence for now.
  }
}

export const processManager = new ProcessManager();
