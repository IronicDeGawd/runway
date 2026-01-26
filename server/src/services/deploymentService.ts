import fs from 'fs-extra';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import { v4 as uuidv4 } from 'uuid';
import { ProjectConfig, PackageManager, ProjectType } from '@pdcp/shared';
import { extractZip } from './zipService';
import { projectRegistry } from './projectRegistry';
import { portManager } from './portManager';
import { pm2Service } from './pm2Service';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import { envService } from './envService';
import { activityLogger } from './activityLogger';
import { eventBus } from '../events/eventBus';
import { caddyConfigManager } from './caddyConfigManager';
import { BuildDetector } from './buildDetector';

const execAsync = util.promisify(exec);

const APPS_DIR = path.resolve(process.cwd(), '../apps');
const TEMP_DIR = path.resolve(process.cwd(), '../temp_uploads');

// Ensure directories exist
fs.ensureDirSync(APPS_DIR);
fs.ensureDirSync(TEMP_DIR);

export class DeploymentService {
  
  private async detectPackageManager(dir: string): Promise<PackageManager> {
    if (await fs.pathExists(path.join(dir, 'pnpm-lock.yaml'))) return 'pnpm';
    if (await fs.pathExists(path.join(dir, 'yarn.lock'))) return 'yarn';
    return 'npm';
  }

  private async installDependencies(dir: string, manager: PackageManager): Promise<void> {
    logger.info(`Installing dependencies in ${dir} using ${manager}`);
    // Use ci for npm if lockfile exists? Or just install. 'npm install' is safer generic.
    const installCmd = manager === 'npm' ? 'npm install' : `${manager} install`;
    
    try {
      await execAsync(installCmd, { cwd: dir });
    } catch (error) {
      logger.error('Dependency installation failed', error);
      throw new AppError('Dependency installation failed', 500);
    }
  }

  private async buildProject(dir: string, manager: PackageManager, projectId: string): Promise<void> {
    // Check if build script exists
    try {
      const pkgJsonPath = path.join(dir, 'package.json');
      const pkgJson = await fs.readJson(pkgJsonPath);
      
      if (pkgJson.scripts && pkgJson.scripts.build) {
        logger.info(`Building project in ${dir}`);
        const envVars = await envService.getEnv(projectId);
        
        await execAsync(`${manager} run build`, { 
          cwd: dir,
          env: { ...process.env, ...envVars }
        });
      } else {
        logger.info('No build script found, skipping build');
      }
    } catch (error) {
      logger.error('Build process failed', error);
      throw new AppError('Build process failed', 500);
    }
  }

  async deployProject(filePath: string, projectName: string, type: ProjectType): Promise<ProjectConfig> {
    const deployId = uuidv4();
    const stagingDir = path.join(TEMP_DIR, deployId);
    let portAllocated = false;
    let newPort: number | null = null;
    
    logger.info(`Starting deployment ${deployId} for ${projectName}`);

    try {
      // 1. Extract zip
      await extractZip(filePath, stagingDir);
      
      // 2. Validate package.json exists
      const pkgJsonPath = path.join(stagingDir, 'package.json');
      if (!await fs.pathExists(pkgJsonPath)) {
        throw new AppError('Invalid project: package.json missing', 400);
      }

      // 3. Detect package manager
      const pkgManager = await this.detectPackageManager(stagingDir);

      // 4. Install dependencies
      await this.installDependencies(stagingDir, pkgManager);

      // 5. Build the project (if required)
      if (type === 'react' || type === 'next') {
        let existingProject = (await projectRegistry.getAll()).find(p => p.name === projectName);
        let pid = existingProject ? existingProject.id : 'new-project-placeholder';
        await this.buildProject(stagingDir, pkgManager, pid);
      }

      // 6. ✅ CRITICAL FIX: Verify build output BEFORE proceeding
      if (type === 'react' || type === 'next') {
        const buildPath = await BuildDetector.verifyBuildOutput(stagingDir, type);
        logger.info(`✅ Build verified: ${buildPath}`);
      }

      // 7. ✅ CRITICAL FIX: Allocate port AFTER successful build
      let project = (await projectRegistry.getAll()).find(p => p.name === projectName);
      let projectId = project ? project.id : uuidv4();
      let port: number;
      
      if (project) {
        port = project.port; // Reuse existing port
        logger.info(`Reusing port ${port} for ${projectId}`);
      } else {
        port = await portManager.allocatePort(projectId);
        newPort = port;
        portAllocated = true;
        logger.info(`Allocated port ${port} for ${projectId}`);
      }

      // 8. Stop existing process before directory swap
      if (project && project.type !== 'react') {
        await pm2Service.stopProject(projectId);
      }

      // 9. Atomic directory swap
      const targetDir = path.join(APPS_DIR, projectId);
      if (await fs.pathExists(targetDir)) {
        await fs.remove(targetDir); 
      }
      await fs.move(stagingDir, targetDir);

      // 10. Register / Update Project
      const newConfig: ProjectConfig = {
        id: projectId,
        name: projectName,
        type,
        port,
        createdAt: project ? project.createdAt : new Date().toISOString(),
        pkgManager,
      };

      if (project) {
        await projectRegistry.update(projectId, newConfig);
      } else {
        await projectRegistry.create(newConfig);
      }

      // 11. Start PM2 process (if not static React)
      if (type !== 'react') {
        await pm2Service.startProject(newConfig);
        
        // Quick health check
        await this.waitForProcessStart(newConfig);
      }

      // 12. ✅ CRITICAL FIX: Update Caddy with modular config
      await caddyConfigManager.updateProjectConfig(newConfig);

      logger.info(`✅ Deployment successful for ${projectName} (${projectId})`);
      
      // Log activity
      await activityLogger.log('deploy', projectName, 
        `Deployed ${projectName} (${type}) successfully`);
      
      // Emit event for realtime updates
      eventBus.emitEvent('project:change', {
        action: project ? 'updated' : 'created',
        projectId,
        project: newConfig
      });
      
      // Cleanup uploaded file
      await fs.remove(filePath);

      return newConfig;

    } catch (error) {
      logger.error('Deployment failed', error);
      
      // Log error activity
      await activityLogger.log('error', projectName, 
        `Deployment failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      // ✅ CRITICAL FIX: Proper cleanup on failure
      try {
        // Remove staging directory
        if (await fs.pathExists(stagingDir)) {
          await fs.remove(stagingDir);
        }
        
        // Release port if we allocated it
        if (portAllocated && newPort) {
          const projectId = (await projectRegistry.getAll()).find(p => p.name === projectName)?.id;
          if (projectId) {
            await portManager.releasePort(newPort);
            logger.info(`Released port ${newPort}`);
          }
        }
      } catch (cleanupError) {
        logger.error('Cleanup failed', cleanupError);
      }
      
      // Cleanup uploaded file
      await fs.remove(filePath);
      throw error;
    }
  }

  /**
   * Wait for PM2 process to start and respond
   */
  private async waitForProcessStart(project: ProjectConfig): Promise<void> {
    const maxWait = 30000; // 30 seconds
    const startTime = Date.now();
    
    logger.info(`Waiting for ${project.name} to start...`);

    while (Date.now() - startTime < maxWait) {
      try {
        const list = await pm2Service.getProcesses();
        const proc = list.find((p: any) => p.name === project.id);
        
        if (proc && proc.status === 'online') {
          logger.info(`✅ ${project.name} is running`);
          return;
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        logger.warn('Error checking process status', error);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    logger.warn(`${project.name} started but may not be fully ready`);
  }
}

export const deploymentService = new DeploymentService();
