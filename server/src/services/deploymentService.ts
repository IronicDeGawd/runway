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
    
    logger.info(`Starting deployment ${deployId} for ${projectName}`);

    try {
      // 1. Extract
      await extractZip(filePath, stagingDir);
      
      // 2. Validate (done during extraction mostly, but can add more here)
      const pkgJsonPath = path.join(stagingDir, 'package.json');
      if (!await fs.pathExists(pkgJsonPath)) {
        throw new AppError('Invalid project: package.json missing', 400);
      }

      // 3. Detect Package Manager
      const pkgManager = await this.detectPackageManager(stagingDir);

      // 4. Install Dependencies
      await this.installDependencies(stagingDir, pkgManager);

      // 5. Build (if required)
      if (type === 'react' || type === 'next') {
        // Need to pass projectId to buildProject for ENV loading.
        let existingProject = (await projectRegistry.getAll()).find(p => p.name === projectName);
        let pid = existingProject ? existingProject.id : null; 

        if (pid) {
           await this.buildProject(stagingDir, pkgManager, pid);
        } else {
           // No ENVs for new project build
           await this.buildProject(stagingDir, pkgManager, 'new-project-placeholder');
        }
      }

      // 6. Allocate Port (if new)
      let project = (await projectRegistry.getAll()).find(p => p.name === projectName);
      let projectId = project ? project.id : uuidv4();
      let port = project ? project.port : await portManager.allocatePort(projectId);

      // 7. Atomic Switch
      const targetDir = path.join(APPS_DIR, projectId);
      
      if (await fs.pathExists(targetDir)) {
        await fs.remove(targetDir); 
      }
      await fs.move(stagingDir, targetDir);

      // 8. Register / Update Project
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

      // 9. Start Process (if not static)
      await pm2Service.startProject(newConfig);

      // 10. Update Caddy
      await import('./caddyService').then(m => m.caddyService.updateConfig());

      logger.info(`Deployment successful for ${projectName} (${projectId})`);
      
      // Log activity
      await activityLogger.log('deploy', projectName, 
        `Deployed ${projectName} (${type}) successfully`);
      
      // Cleanup uploaded file
      await fs.remove(filePath);

      return newConfig;

    } catch (error) {
      logger.error('Deployment failed', error);
      
      // Log error activity
      await activityLogger.log('error', projectName, 
        `Deployment failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      // Cleanup staging
      await fs.remove(stagingDir);
      // Cleanup file
      await fs.remove(filePath);
      throw error;
    }
  }
}

export const deploymentService = new DeploymentService();
