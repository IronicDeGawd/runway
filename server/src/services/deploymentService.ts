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
    const cmd = manager === 'npm' ? 'npm ci' : `${manager} install`; // Use ci for npm if lockfile exists? Or just install. 'npm install' is safer generic.
    // Actually Plan says "npm install". 'npm ci' requires lockfile.
    // let's use 'install'.
    const installCmd = manager === 'npm' ? 'npm install' : `${manager} install`;
    
    try {
      await execAsync(installCmd, { cwd: dir });
    } catch (error) {
      logger.error('Dependency installation failed', error);
      throw new AppError('Dependency installation failed', 500);
    }
  }

import { envService } from './envService';

// ...

  private async buildProject(dir: string, manager: PackageManager, projectId: string): Promise<void> {
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
        // But projectId is generated later in step 6?
        // Wait, "Allocating Port" step 6 checks project, but we might be updating.
        // We really should know the projectId BEFORE building if we want to load stored ENVs.
        // If it's a new project, are there stored ENVs? No.
        // If it's an update, yes.
        
        // We should determine projectId EARLIER.
        // Step 6 moved up or projectId detection logic duplicated.
        
        let existingProject = (await projectRegistry.getAll()).find(p => p.name === projectName);
        let pid = existingProject ? existingProject.id : null; // If null, no stored ENVs yet.

        // If new project, PID is random, but we haven't saved it or ENVs yet.
        // So envs are empty.
        // If we want build-time ENVs for NEW projects, we need to allow setting ENVs before deploy?
        // Or deploy fails/builds without ENVs, then user sets ENVs, then rebuilds.
        // "Frontend ENV changes require rebuild".
        // Typical flow: Deploy -> Set ENVs -> Rebuild.
        
        if (pid) {
           await this.buildProject(stagingDir, pkgManager, pid);
        } else {
           // No ENVs for new project build
           await this.buildProject(stagingDir, pkgManager, 'new-project-placeholder');
        }
      }

      // 6. Allocate Port (if new)
      // Check if project exists
      let project = (await projectRegistry.getAll()).find(p => p.name === projectName);
      let projectId = project ? project.id : uuidv4();
      let port = project ? project.port : await portManager.allocatePort(projectId);

      // 7. Atomic Switch
      const projectDir = path.join(APPS_DIR, projectId);
      
      // Prepare destination
      // If updating, we might want to keep some data? But "Existing project directory replaced" (Tech.md)
      // So comprehensive replacement.
      // But we should use a temporary move to adjacent folder safe-switch.
      
      // We'll move stagingDir to APPS_DIR/projectId
      // If it exists, remove it first?
      // Better: Move to APPS_DIR/projectId_new, then rename to projectId (atomic overwrite often works)
      // Node fs.rename(new, old) is atomic on POSIX if same filesystem.
      // APPS_DIR is one dir.
      
      const targetDir = path.join(APPS_DIR, projectId);
      
      // Ensure specific app dir is clear or overwritten.
      // fs.emptyDir(targetDir) ? No, we want atomic switch.
      
      // We will simply remove the old one and move the new one. 
      // There is a small window of downtime.
      // Real atomic switch: symlinks. /apps/id -> /apps/releases/v1.
      // Plan Phase 2 says "Only move to /apps/<id> after success".
      // It implies directory replacement.
      
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
      // Import locally to avoid circular dep if needed, or import at top
      // We already imported pm2Service (need to add import)
      await pm2Service.startProject(newConfig);

      logger.info(`Deployment successful for ${projectName} (${projectId})`);
      
      // Cleanup uploaded file
      await fs.remove(filePath);

      return newConfig;

    } catch (error) {
      logger.error('Deployment failed', error);
      // Cleanup staging
      await fs.remove(stagingDir);
      // Cleanup file
      await fs.remove(filePath);
      throw error;
    }
  }
}

export const deploymentService = new DeploymentService();
