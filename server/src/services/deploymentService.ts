import fs from 'fs-extra';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import { v4 as uuidv4 } from 'uuid';
import { ProjectConfig, PackageManager, ProjectType, DeploymentSource, UploadType } from '@runway/shared';
import { extractZip, findProjectRoot } from './zipService';
import { projectRegistry } from './projectRegistry';
import { portManager } from './portManager';
import { pm2Service } from './pm2Service';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import { envManager } from './envManager';
import { activityLogger } from './activityLogger';
import { eventBus } from '../events/eventBus';
import { caddyConfigManager } from './caddyConfigManager';
import { BuildDetector } from './buildDetector';
import { patcherService } from './patcher/patcherService';
import { UploadTypeDetector } from './uploadTypeDetector';
import { EnvMutabilityCalculator } from './envMutabilityCalculator';

const execAsync = util.promisify(exec);

const APPS_DIR = path.resolve(process.cwd(), '../apps');
const TEMP_DIR = path.resolve(process.cwd(), '../temp_uploads');

// Ensure directories exist
fs.ensureDirSync(APPS_DIR);
fs.ensureDirSync(TEMP_DIR);

/**
 * Parse .env file content into a Record
 */
function parseEnvContent(content: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex > 0) {
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      // Remove surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      vars[key] = value;
    }
  }
  return vars;
}

export class DeploymentService {
  // Track cleanup timers to prevent timer accumulation
  private cleanupTimers = new Map<string, NodeJS.Timeout>();

  /**
   * Detect package manager used in project
   */

  private async detectPackageManager(dir: string): Promise<PackageManager> {
    if (await fs.pathExists(path.join(dir, 'pnpm-lock.yaml'))) return 'pnpm';
    if (await fs.pathExists(path.join(dir, 'yarn.lock'))) return 'yarn';
    return 'npm';
  }

  private async installDependencies(dir: string, manager: PackageManager): Promise<void> {
    logger.info(`Installing dependencies in ${dir} using ${manager}`);
    
    // Install ALL dependencies including devDependencies (needed for build)
    const installCmd = manager === 'npm' 
      ? 'npm install --include=dev' 
      : manager === 'yarn'
      ? 'yarn install'
      : 'pnpm install';
    
    try {
      const { stdout, stderr } = await execAsync(installCmd, { 
        cwd: dir,
        env: { ...process.env, NODE_ENV: 'development' } // Force dev mode
      });
      if (stdout) logger.debug('Install output:', stdout);
      if (stderr) logger.warn('Install warnings:', stderr);
    } catch (error: any) {
      logger.error('Dependency installation failed', {
        error: error.message,
        stdout: error.stdout,
        stderr: error.stderr,
        code: error.code
      });
      throw new AppError(
        `Dependency installation failed: ${error.stderr || error.message}`, 
        500
      );
    }
  }

  private async buildProject(dir: string, manager: PackageManager, projectId: string, projectName: string, type: ProjectType): Promise<void> {
    try {
      const pkgJsonPath = path.join(dir, 'package.json');
      const pkgJson = await fs.readJson(pkgJsonPath);
      
      if (pkgJson.scripts && pkgJson.scripts.build) {
        logger.info(`Building project in ${dir}`);
        const envVars = await envManager.getEnv(projectId);
        
        let buildCmd = `${manager} run build`;
        
        // Use CLI argument for base path in React/Vite projects
        // This is more robust than patching vite.config.ts
        if (type === 'react') {
           // Ensure safe project name for URL
           const safeName = projectName.toLowerCase().replace(/[^a-z0-9]/g, '-');
           const basePath = `/app/${safeName}`;
           
           if (manager === 'npm') {
             // npm requires -- to pass args to the script
             buildCmd += ` -- --base=${basePath}`;
           } else {
             // yarn/pnpm usually append args directly, but explicit --base works for Vite
             buildCmd += ` --base=${basePath}`;
           }
           logger.info(`Using base path override: ${basePath}`);
        }
        
        try {
          const { stdout, stderr } = await execAsync(buildCmd, { 
            cwd: dir,
            env: { ...process.env, ...envVars },
            maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large build outputs
          });
          
          if (stdout) logger.info('Build output:', stdout);
          if (stderr) logger.warn('Build warnings:', stderr);
          
          logger.info('✅ Build completed successfully');
        } catch (buildError: any) {
          // Log the full build error with output
          logger.error('Build command failed', {
            command: buildCmd,
            error: buildError.message,
            stdout: buildError.stdout,
            stderr: buildError.stderr,
            code: buildError.code
          });
          
          throw new AppError(
            `Build failed: ${buildError.stderr || buildError.stdout || buildError.message}`,
            500
          );
        }
      } else {
        logger.info('No build script found, skipping build');
      }
    } catch (error: any) {
      if (error instanceof AppError) throw error;
      
      logger.error('Build process error', error);
      throw new AppError(
        `Build process failed: ${error.message}`,
        500
      );
    }
  }

  async deployProject(
    filePath: string,
    projectName: string,
    type: ProjectType,
    options: {
      onProgress?: (step: string, message: string, percentage: number) => void,
      deploymentId?: string,
      mode?: 'create' | 'update',
      buildMode?: 'local' | 'server',
      confirmServerBuild?: boolean,
      forceBuild?: boolean,
      domains?: string[],
      envVars?: Record<string, string>,
      // ENV mutability tracking
      deploymentSource?: DeploymentSource,
      envInjected?: boolean
    } = {}
  ): Promise<ProjectConfig> {
    const deployId = options.deploymentId || uuidv4();
    const stagingDir = path.join(TEMP_DIR, deployId);
    let portAllocated = false;
    let newPort: number | null = null;
    
    // Helper for progress updates
    const reportProgress = (step: string, msg: string, pct: number) => {
      if (options.onProgress) options.onProgress(step, msg, pct);
      logger.info(`[Deploy:${projectName}] ${msg} (${pct}%)`);
    };

    reportProgress('init', `Starting deployment ${deployId}`, 0);

    try {
      // 0. Pre-Verification based on mode
      const allProjects = await projectRegistry.getAll();
      const existingProject = allProjects.find(p => p.name === projectName);

      if (options.mode === 'create' && existingProject) {
        throw new AppError(`Project with name "${projectName}" already exists. Use the project details page to update it.`, 409);
      }

      if (options.mode === 'update' && !existingProject) {
        throw new AppError(`Project "${projectName}" not found. Cannot update a non-existent project.`, 404);
      }
      // 1. Extract zip
      reportProgress('upload', 'Extracting package...', 10);
      await extractZip(filePath, stagingDir);
      logger.info('✅ Zip extracted');

      // Handle nested directory structure (e.g., zip -r project.zip my-app/)
      const projectRoot = await findProjectRoot(stagingDir);
      if (projectRoot !== stagingDir) {
        // Move nested contents to staging root for consistent handling
        const tempPath = stagingDir + '_temp';
        await fs.move(projectRoot, tempPath);
        await fs.remove(stagingDir);
        await fs.move(tempPath, stagingDir);
        logger.info('Flattened nested directory structure');
      }

      // 2. Validate package.json exists (except for static sites)
      if (type !== 'static') {
        const pkgJsonPath = path.join(stagingDir, 'package.json');
        if (!await fs.pathExists(pkgJsonPath)) {
          throw new AppError('Invalid project: package.json missing', 400);
        }
      }

      // 2.5. Static site: ensure index.html exists
      if (type === 'static') {
        const indexPath = path.join(stagingDir, 'index.html');
        if (!await fs.pathExists(indexPath)) {
          // Find all HTML files (excluding __MACOSX and hidden dirs)
          const allFiles = await fs.readdir(stagingDir);
          const htmlFiles = allFiles.filter((f: string) => f.endsWith('.html') || f.endsWith('.htm'));
          if (htmlFiles.length === 1) {
            const srcFile = path.join(stagingDir, htmlFiles[0]);
            await fs.copy(srcFile, indexPath);
            logger.info(`Static site: renamed ${htmlFiles[0]} to index.html`);
          } else if (htmlFiles.length === 0) {
            throw new AppError('Static project has no HTML files. Include at least one .html file.', 400);
          } else {
            throw new AppError(`Static project has multiple HTML files (${htmlFiles.join(', ')}) but no index.html. Please include an index.html as the entry point.`, 400);
          }
        }
      }

      // 3. Detect package manager
      const pkgManager = type !== 'static' ? await this.detectPackageManager(stagingDir) : 'npm';
      logger.info(`Detected package manager: ${pkgManager}`);

      // 4. Install dependencies (skip for static sites)
      if (type !== 'static') {
        reportProgress('install', 'Installing dependencies...', 25);
        await this.installDependencies(stagingDir, pkgManager);
        logger.info('✅ Dependencies installed');
      }

      // 5. Apply project-specific patches (Router, Configs, etc.) — skip for static
      if (type !== 'static') {
        reportProgress('patch', 'Applying patches...', 40);
        await patcherService.patchProject(stagingDir, type, {
          projectId: deployId, // Use the deployment ID for logging context
          projectName,
          deploymentId: deployId
        });
      }

      // 6. Build the project (if required) - static sites don't need building
      if (type === 'react' || type === 'next') {
        reportProgress('build', 'Building project...', 50);
        let existingProject = (await projectRegistry.getAll()).find(p => p.name === projectName);
        let pid = existingProject ? existingProject.id : 'new-project-placeholder';
        await this.buildProject(stagingDir, pkgManager, pid, projectName, type);
        reportProgress('build', 'Build complete', 70);
      }

      // 6. ✅ CRITICAL FIX: Verify build output BEFORE proceeding
      if (type === 'react' || type === 'next') {
        const buildPath = await BuildDetector.verifyBuildOutput(stagingDir, type);
        logger.info(`✅ Build verified: ${buildPath}`);
      }

      // 6.5. Detect upload type and calculate ENV mutability
      const uploadTypeResult = await UploadTypeDetector.detect(stagingDir, type);
      const deploymentSource: DeploymentSource = options.deploymentSource || 'ui';
      const mutabilityInfo = EnvMutabilityCalculator.calculate({
        projectType: type,
        uploadType: uploadTypeResult.uploadType,
        deploymentSource,
        envInjected: options.envInjected ?? false,
        hasSource: uploadTypeResult.hasSource,
      });
      logger.info(`Upload type: ${uploadTypeResult.uploadType}, ENV mutable: ${mutabilityInfo.mutable}`);

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
      if (project && project.type !== 'react' && project.type !== 'static') {
        await pm2Service.stopProject(projectId);
        logger.info('Stopped existing PM2 process');
      }

      // 9. Atomic directory swap (preserving env and logs)
      const targetDir = path.join(APPS_DIR, projectId);
      let envBackupPath: string | null = null;
      let logsBackupPath: string | null = null;
      if (await fs.pathExists(targetDir)) {
        // Backup .env.enc before removing old directory
        const envEncPath = path.join(targetDir, '.env.enc');
        if (await fs.pathExists(envEncPath)) {
          envBackupPath = path.join(APPS_DIR, `${projectId}__env_backup.enc`);
          await fs.copy(envEncPath, envBackupPath);
          logger.info('Backed up encrypted environment variables');
        }
        // Backup logs directory
        const logsDir = path.join(targetDir, 'logs');
        if (await fs.pathExists(logsDir)) {
          logsBackupPath = path.join(APPS_DIR, `${projectId}__logs_backup`);
          await fs.copy(logsDir, logsBackupPath);
          logger.info('Backed up logs directory');
        }
        await fs.remove(targetDir); 
      }
      await fs.move(stagingDir, targetDir);
      // Restore backups
      if (envBackupPath && await fs.pathExists(envBackupPath)) {
        await fs.copy(envBackupPath, path.join(targetDir, '.env.enc'));
        await fs.remove(envBackupPath);
        logger.info('Restored encrypted environment variables');
      }
      if (logsBackupPath && await fs.pathExists(logsBackupPath)) {
        await fs.copy(logsBackupPath, path.join(targetDir, 'logs'));
        await fs.remove(logsBackupPath);
        logger.info('Restored logs directory');
      }
      logger.info(`Deployed to ${targetDir}`);

      // 10. Register / Update Project
      const newConfig: ProjectConfig = {
        id: projectId,
        name: projectName,
        type,
        port,
        createdAt: project ? project.createdAt : new Date().toISOString(),
        pkgManager,
        domains: options.domains || project?.domains,
        // ENV mutability tracking
        deploymentSource,
        uploadType: uploadTypeResult.uploadType,
        envMutable: mutabilityInfo.mutable,
        hasSource: uploadTypeResult.hasSource,
      };

      if (project) {
        await projectRegistry.update(projectId, newConfig);
      } else {
        await projectRegistry.create(newConfig);
      }
      logger.info('✅ Project registered');

      // 10.5. Set initial environment variables if provided at deployment time
      if (options.envVars && Object.keys(options.envVars).length > 0) {
        reportProgress('env', 'Setting environment variables...', 75);
        // Skip mutability check for initial deployment
        await envManager.setEnv(projectId, options.envVars, true);
        logger.info(`Set ${Object.keys(options.envVars).length} environment variables`);
      }

      // 10.6. Cleanup node_modules for React/Next.js projects to save disk space
      if (type === 'react' || type === 'next') {
        const nodeModulesPath = path.join(targetDir, 'node_modules');
        if (await fs.pathExists(nodeModulesPath)) {
          reportProgress('cleanup', 'Cleaning up build dependencies...', 78);
          await fs.remove(nodeModulesPath);
          logger.info('Cleaned up node_modules after build');
        }
      }

      // 11. Start PM2 process (if not static site)
      if (type !== 'react' && type !== 'static') {
        // Inject PORT so apps using process.env.PORT bind to the correct allocated port
        await envManager.setEnv(projectId, { PORT: String(port) }, true);
        logger.info(`Injected PORT=${port} env var`);

        await pm2Service.startProject(newConfig);
        logger.info('PM2 process started');

        // HTTP health check — warn if service does not respond on the allocated port
        const health = await this.waitForProcessStart(newConfig);
        if (!health.healthy) {
          this.setHealthWarning(deployId, health.warning);
        }
      }

      // 12. ✅ CRITICAL FIX: Update Caddy with modular config
      reportProgress('deploy', 'Configuring reverse proxy...', 90);
      await caddyConfigManager.updateProjectConfig(newConfig);
      logger.info('✅ Caddy config updated');

      // 12.5. Health check for react/static: probe Caddy path
      if (type === 'react' || type === 'static') {
        const health = await this.waitForCaddyPath(newConfig);
        if (!health.healthy) {
          this.setHealthWarning(deployId, health.warning);
        }
      }

      // 13. Apply Environment Variables (Runtime Config)
      // This ensures React apps get env-config.js and PM2 apps get envs
      // Note: for PM2 apps we already passed envs in startProject via config if we used envManager there?
      // Actually we need to ensure PM2Service uses EnvManager too.
      // But for React, we explicitly need to generate the file now.
      await envManager.applyEnv(projectId);

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

    } catch (error: any) {
      logger.error('Deployment failed', {
        error: error.message,
        stack: error.stack,
        statusCode: error.statusCode
      });
      
      // Log error activity with detailed message
      const errorMessage = error instanceof AppError 
        ? error.message 
        : (error.stderr || error.stdout || error.message || 'Unknown error');
      
      await activityLogger.log('error', projectName, 
        `Deployment failed: ${errorMessage}`);
      
      // ✅ CRITICAL FIX: Proper cleanup on failure
      try {
        // Remove staging directory
        if (await fs.pathExists(stagingDir)) {
          await fs.remove(stagingDir);
          logger.info('Cleaned up staging directory');
        }
        
        // Release port if we allocated it
        if (portAllocated && newPort) {
          await portManager.releasePort(newPort);
          logger.info(`Released port ${newPort}`);
        }
      } catch (cleanupError) {
        logger.error('Cleanup failed', cleanupError);
      }
      
      // Cleanup uploaded file
      try {
        await fs.remove(filePath);
      } catch {
        // Ignore if already removed
      }
      
      throw error;
    }
  }

  // Track active deployments for polling fallback
  private activeDeployments = new Map<string, { 
    status: 'deploying' | 'success' | 'failed', 
    progress: number, 
    logs: string[], 
    error?: string,
    project?: ProjectConfig,
    healthWarning?: string
  }>();

  updateDeploymentStatus(id: string, update: Partial<{ status: 'deploying' | 'success' | 'failed', progress: number, logs: string[], error?: string, project: ProjectConfig }>) {
    const current = this.activeDeployments.get(id) || { status: 'deploying', progress: 0, logs: [], error: undefined };
    
    // Append logs if provided, don't overwrite array
    let newLogs = current.logs;
    if (update.logs) {
      newLogs = [...current.logs, ...update.logs];
    } else if (update.status === 'success') {
       newLogs = [...current.logs, 'Deployment successful!', 'Project is online.'];
    }

    this.activeDeployments.set(id, {
      ...current,
      ...update,
      logs: newLogs
    });

    // Clean up successful/failed deployments after 5 minutes
    // Use tracked timers to prevent timer accumulation
    if (update.status === 'success' || update.status === 'failed') {
      // Clear any existing timer for this deployment ID
      const existingTimer = this.cleanupTimers.get(id);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      // Create new cleanup timer and track it
      const timer = setTimeout(() => {
        this.activeDeployments.delete(id);
        this.cleanupTimers.delete(id);
      }, 5 * 60 * 1000);

      this.cleanupTimers.set(id, timer);
    }
  }

  getDeploymentStatus(id: string) {
    return this.activeDeployments.get(id);
  }

  /**
   * Deploy a pre-built project (from CLI local build)
   * Skips the install and build steps
   */
  async deployPrebuiltProject(
    filePath: string,
    projectName: string,
    type: ProjectType,
    version?: string,
    options: {
      deploymentSource?: DeploymentSource,
      envInjected?: boolean
    } = {}
  ): Promise<ProjectConfig> {
    const deployId = uuidv4();
    const stagingDir = path.join(TEMP_DIR, deployId);
    let portAllocated = false;
    let newPort: number | null = null;

    logger.info(`[Deploy:${projectName}] Starting pre-built deployment ${deployId}`);

    try {
      // 1. Extract zip
      await extractZip(filePath, stagingDir);
      logger.info('✅ Zip extracted');

      // Handle nested directory structure (e.g., zip -r project.zip my-app/)
      const projectRoot = await findProjectRoot(stagingDir);
      if (projectRoot !== stagingDir) {
        // Move nested contents to staging root for consistent handling
        const tempPath = stagingDir + '_temp';
        await fs.move(projectRoot, tempPath);
        await fs.remove(stagingDir);
        await fs.move(tempPath, stagingDir);
        logger.info('Flattened nested directory structure');
      }

      // 2. Validate package.json exists (except for static sites)
      if (type !== 'static') {
        const pkgJsonPath = path.join(stagingDir, 'package.json');
        if (!await fs.pathExists(pkgJsonPath)) {
          throw new AppError('Invalid project: package.json missing', 400);
        }
      }

      // 2.5. Static site: ensure index.html exists
      if (type === 'static') {
        const indexPath = path.join(stagingDir, 'index.html');
        if (!await fs.pathExists(indexPath)) {
          const allFiles = await fs.readdir(stagingDir);
          const htmlFiles = allFiles.filter((f: string) => f.endsWith('.html') || f.endsWith('.htm'));
          if (htmlFiles.length === 1) {
            const srcFile = path.join(stagingDir, htmlFiles[0]);
            await fs.copy(srcFile, indexPath);
            logger.info(`Static site: renamed ${htmlFiles[0]} to index.html`);
          } else if (htmlFiles.length === 0) {
            throw new AppError('Static project has no HTML files. Include at least one .html file.', 400);
          } else {
            throw new AppError(`Static project has multiple HTML files (${htmlFiles.join(', ')}) but no index.html. Please include an index.html as the entry point.`, 400);
          }
        }
      }

      // 3. Detect package manager
      const pkgManager = type !== 'static' ? await this.detectPackageManager(stagingDir) : 'npm';
      logger.info(`Detected package manager: ${pkgManager}`);

      // 4. For Next.js and Node.js, install production dependencies only
      if (type !== 'react' && type !== 'static') {
        logger.info('Installing production dependencies...');
        const installCmd = pkgManager === 'npm'
          ? 'npm install --omit=dev'
          : pkgManager === 'yarn'
          ? 'yarn install --production'
          : 'pnpm install --prod';

        try {
          await execAsync(installCmd, {
            cwd: stagingDir,
            env: { ...process.env, NODE_ENV: 'production' }
          });
          logger.info('✅ Production dependencies installed');
        } catch (error: any) {
          logger.warn('Could not install production deps:', error.message);
          // Continue anyway - maybe deps are bundled
        }
      }

      // 4.5. Apply patches (basePath/assetPrefix for Next.js runtime config)
      if (type !== 'static') {
        await patcherService.patchProject(stagingDir, type, {
          projectId: 'prebuilt',
          projectName,
          deploymentId: 'prebuilt'
        });
      }

      // 5. Verify build output exists
      if (type === 'react') {
        const distPath = path.join(stagingDir, 'dist');
        if (!await fs.pathExists(distPath)) {
          throw new AppError('Build output not found. Make sure to include the dist/ folder.', 400);
        }
      } else if (type === 'next') {
        const nextPath = path.join(stagingDir, '.next');
        if (!await fs.pathExists(nextPath)) {
          throw new AppError('Build output not found. Make sure to include the .next/ folder.', 400);
        }
      } else if (type === 'static') {
        const indexPath = path.join(stagingDir, 'index.html');
        if (!await fs.pathExists(indexPath)) {
          throw new AppError('Static site must have an index.html file.', 400);
        }
      }

      // 5.5. Detect upload type and calculate ENV mutability
      const uploadTypeResult = await UploadTypeDetector.detect(stagingDir, type);
      const deploymentSource: DeploymentSource = options.deploymentSource || 'cli';
      const mutabilityInfo = EnvMutabilityCalculator.calculate({
        projectType: type,
        uploadType: uploadTypeResult.uploadType,
        deploymentSource,
        envInjected: options.envInjected ?? false,
        hasSource: uploadTypeResult.hasSource,
      });
      logger.info(`Pre-built upload type: ${uploadTypeResult.uploadType}, ENV mutable: ${mutabilityInfo.mutable}`);

      // 6. Check for existing project
      const allProjects = await projectRegistry.getAll();
      const existingProject = allProjects.find(p => p.name === projectName);

      let projectId = existingProject ? existingProject.id : uuidv4();
      let port: number;

      if (existingProject) {
        port = existingProject.port;
        logger.info(`Reusing port ${port} for ${projectId}`);
      } else {
        port = await portManager.allocatePort(projectId);
        newPort = port;
        portAllocated = true;
        logger.info(`Allocated port ${port} for ${projectId}`);
      }

      // 7. Stop existing process before directory swap
      if (existingProject && existingProject.type !== 'react' && existingProject.type !== 'static') {
        await pm2Service.stopProject(projectId);
        logger.info('Stopped existing PM2 process');
      }

      // 8. Atomic directory swap (preserving env and logs)
      const targetDir = path.join(APPS_DIR, projectId);
      let envBackupPath: string | null = null;
      let logsBackupPath: string | null = null;
      if (await fs.pathExists(targetDir)) {
        // Backup .env.enc before removing old directory
        const envEncPath = path.join(targetDir, '.env.enc');
        if (await fs.pathExists(envEncPath)) {
          envBackupPath = path.join(APPS_DIR, `${projectId}__env_backup.enc`);
          await fs.copy(envEncPath, envBackupPath);
          logger.info('Backed up encrypted environment variables');
        }
        // Backup logs directory
        const logsDir = path.join(targetDir, 'logs');
        if (await fs.pathExists(logsDir)) {
          logsBackupPath = path.join(APPS_DIR, `${projectId}__logs_backup`);
          await fs.copy(logsDir, logsBackupPath);
          logger.info('Backed up logs directory');
        }
        await fs.remove(targetDir);
      }
      await fs.move(stagingDir, targetDir);
      // Restore backups
      if (envBackupPath && await fs.pathExists(envBackupPath)) {
        await fs.copy(envBackupPath, path.join(targetDir, '.env.enc'));
        await fs.remove(envBackupPath);
        logger.info('Restored encrypted environment variables');
      }
      if (logsBackupPath && await fs.pathExists(logsBackupPath)) {
        await fs.copy(logsBackupPath, path.join(targetDir, 'logs'));
        await fs.remove(logsBackupPath);
        logger.info('Restored logs directory');
      }
      logger.info(`Deployed to ${targetDir}`);

      // 8.5. Extract .env from Node.js projects and store in database
      if (type === 'node') {
        const envFilePath = path.join(targetDir, '.env');
        if (await fs.pathExists(envFilePath)) {
          const envContent = await fs.readFile(envFilePath, 'utf-8');
          const extractedEnvVars = parseEnvContent(envContent);

          if (Object.keys(extractedEnvVars).length > 0) {
            // Store env vars in encrypted database
            await envManager.setEnv(projectId, extractedEnvVars, true); // skipMutabilityCheck
            logger.info(`Loaded ${Object.keys(extractedEnvVars).length} env vars from uploaded .env`);
          }

          // Remove .env from deployed files (it's now in encrypted DB)
          await fs.remove(envFilePath);
          logger.info('Removed .env file from deployment (stored securely in database)');
        }
      }

      // 9. Register / Update Project
      const newConfig: ProjectConfig = {
        id: projectId,
        name: projectName,
        type,
        port,
        createdAt: existingProject ? existingProject.createdAt : new Date().toISOString(),
        pkgManager,
        // ENV mutability tracking
        deploymentSource,
        uploadType: uploadTypeResult.uploadType,
        envMutable: mutabilityInfo.mutable,
        hasSource: uploadTypeResult.hasSource,
      };

      if (existingProject) {
        await projectRegistry.update(projectId, newConfig);
      } else {
        await projectRegistry.create(newConfig);
      }
      logger.info('✅ Project registered');

      // 10. Start PM2 process (if not static site)
      if (type !== 'react' && type !== 'static') {
        // Inject PORT so apps using process.env.PORT bind to the correct allocated port
        await envManager.setEnv(projectId, { PORT: String(port) }, true);
        logger.info(`Injected PORT=${port} env var`);

        await pm2Service.startProject(newConfig);
        logger.info('PM2 process started');

        // HTTP health check — warn if service does not respond on the allocated port
        const health = await this.waitForProcessStart(newConfig);
        if (!health.healthy) {
          this.setHealthWarning(deployId, health.warning);
        }
      }

      // 11. Update Caddy config
      await caddyConfigManager.updateProjectConfig(newConfig);
      logger.info('✅ Caddy config updated');

      // 11.5. Health check for react/static: probe Caddy path
      if (type === 'react' || type === 'static') {
        const health = await this.waitForCaddyPath(newConfig);
        if (!health.healthy) {
          this.setHealthWarning(deployId, health.warning);
        }
      }

      // 12. Apply Runtime Config (for React env-config.js)
      await envManager.applyEnv(projectId);

      logger.info(`✅ Pre-built deployment successful for ${projectName} (${projectId})`);

      // Log activity
      await activityLogger.log('deploy', projectName,
        `Deployed ${projectName} (${type}) from pre-built artifacts${version ? ` v${version}` : ''}`);

      // Emit event for realtime updates
      eventBus.emitEvent('project:change', {
        action: existingProject ? 'updated' : 'created',
        projectId,
        project: newConfig
      });

      // Cleanup uploaded file
      await fs.remove(filePath);

      return newConfig;

    } catch (error: any) {
      logger.error('Pre-built deployment failed', {
        error: error.message,
        stack: error.stack
      });

      await activityLogger.log('error', projectName,
        `Deployment failed: ${error.message}`);

      // Cleanup
      try {
        if (await fs.pathExists(stagingDir)) {
          await fs.remove(stagingDir);
        }
        if (portAllocated && newPort) {
          await portManager.releasePort(newPort);
        }
      } catch (cleanupError) {
        logger.error('Cleanup failed', cleanupError);
      }

      await fs.remove(filePath).catch(() => {});

      throw error;
    }
  }

  /**
   * After Caddy config is updated, probe the app's path on localhost:80.
   * Used for react/static projects served directly by Caddy (no PM2).
   */
  private async waitForCaddyPath(project: ProjectConfig): Promise<{ healthy: boolean; warning?: string }> {
    const safeName = project.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const appPath = `/app/${safeName}`;
    const httpTimeout = 15000;
    const httpStart = Date.now();

    logger.info(`Probing Caddy path http://localhost:80${appPath} for ${project.name}...`);

    while (Date.now() - httpStart < httpTimeout) {
      try {
        const responded = await new Promise<boolean>((resolve) => {
          const http = require('http');
          const req = http.get(
            { hostname: 'localhost', port: 80, path: appPath, timeout: 2000 },
            (res: any) => resolve(res.statusCode >= 200 && res.statusCode < 400) // only 2xx/3xx = actually serving content
          );
          req.on('error', () => resolve(false));
          req.on('timeout', () => { req.destroy(); resolve(false); });
        });

        if (responded) {
          logger.info(`✅ ${project.name} is reachable via Caddy at ${appPath}`);
          return { healthy: true };
        }
      } catch {
        // ignore, retry
      }
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    const warning = `Static/React app did not become reachable at ${appPath} within 15s. Caddy may still be reloading — try the URL in a few seconds.`;
    logger.warn(warning);
    return { healthy: false, warning };
  }

  private setHealthWarning(deployId: string, warning?: string): void {
    if (!deployId) return;
    const current = this.activeDeployments.get(deployId);
    if (current) {
      this.activeDeployments.set(deployId, { ...current, healthWarning: warning });
    }
  }

  /**
   * Wait for PM2 process to start (phase 1) then probe HTTP endpoint (phase 2).
   * Returns { healthy: boolean; warning?: string }.
   * Never throws — a health-check failure is surfaced as a warning, not an error.
   */
  private async waitForProcessStart(project: ProjectConfig): Promise<{ healthy: boolean; warning?: string }> {
    const pm2Timeout = 15000;  // 15s to go online in PM2
    const httpTimeout = 15000; // 15s for HTTP to respond
    const startTime = Date.now();

    logger.info(`Waiting for ${project.name} to start...`);

    // Phase 1: wait for PM2 status === 'online'
    while (Date.now() - startTime < pm2Timeout) {
      try {
        const list = await pm2Service.getProcesses();
        const proc = list.find((p: any) => p.name === project.id);

        if (proc && proc.status === 'online') {
          logger.info(`✅ ${project.name} PM2 process is online`);
          break;
        }

        if (proc && (proc.status === 'errored' || proc.status === 'stopped')) {
          logger.warn(`${project.name} process ${proc.status} immediately after start`);
          return {
            healthy: false,
            warning: `Process exited with status "${proc.status}" immediately after start. The app may have a hardcoded port or missing entry point. Run \`runway logs ${project.name}\` to investigate.`,
          };
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        logger.warn('Error checking PM2 process status', error);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Phase 2: probe HTTP on the allocated port
    const httpStart = Date.now();
    logger.info(`Probing http://localhost:${project.port} for ${project.name}...`);

    while (Date.now() - httpStart < httpTimeout) {
      try {
        const responded = await new Promise<boolean>((resolve) => {
          const http = require('http');
          const req = http.get(
            { hostname: 'localhost', port: project.port, path: '/', timeout: 2000 },
            () => resolve(true)
          );
          req.on('error', () => resolve(false));
          req.on('timeout', () => { req.destroy(); resolve(false); });
        });

        if (responded) {
          logger.info(`✅ ${project.name} is responding on port ${project.port}`);
          return { healthy: true };
        }
      } catch {
        // ignore, retry
      }
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    const warning = `Service did not respond on port ${project.port} after 30s. If your app uses a hardcoded port instead of process.env.PORT, it won't be reachable. Run \`runway logs ${project.name}\` to investigate.`;
    logger.warn(warning);
    return { healthy: false, warning };
  }

  /**
   * Rebuild an existing project
   */
  async rebuildProject(projectId: string): Promise<ProjectConfig> {
    const project = await projectRegistry.getById(projectId);
    if (!project) {
      throw new AppError('Project not found', 404);
    }

    // Static projects cannot be rebuilt
    if (project.type === 'static') {
      throw new AppError('Static projects cannot be rebuilt', 400);
    }

    const projectDir = path.join(APPS_DIR, projectId);
    if (!await fs.pathExists(projectDir)) {
      throw new AppError('Project directory not found', 404);
    }

    logger.info(`Rebuilding project ${project.name} (${projectId})`);

    try {
      // 0. Re-install dependencies if node_modules is missing (cleaned up after initial deploy)
      const nodeModulesPath = path.join(projectDir, 'node_modules');
      if (!await fs.pathExists(nodeModulesPath)) {
        logger.info('node_modules missing, re-installing dependencies before rebuild...');
        await this.installDependencies(projectDir, project.pkgManager);
        logger.info('✅ Dependencies re-installed for rebuild');
      }

      // 1. Build the project
      await this.buildProject(
        projectDir,
        project.pkgManager,
        projectId,
        project.name,
        project.type
      );
      logger.info('✅ Rebuild completed');

      // 2. Verify build output
      if (project.type === 'react' || project.type === 'next') {
        await BuildDetector.verifyBuildOutput(projectDir, project.type);
      }

      // 3. Restart PM2 process for Node/Next projects
      if (project.type === 'node' || project.type === 'next') {
        await pm2Service.restartProject(projectId);
        logger.info('PM2 process restarted');
        await this.waitForProcessStart(project);
      }

      // 4. Update Caddy config (in case paths changed)
      await caddyConfigManager.updateProjectConfig(project);
      logger.info('✅ Caddy config updated');

      // 5. Log activity
      await activityLogger.log('deploy', project.name,
        `Rebuilt ${project.name} successfully`);

      // 6. Emit event for realtime updates
      eventBus.emitEvent('project:change', {
        action: 'updated',
        projectId,
        project
      });

      return project;
    } catch (error: any) {
      logger.error('Rebuild failed', {
        error: error.message,
        stack: error.stack
      });

      await activityLogger.log('error', project.name,
        `Rebuild failed: ${error.message}`);

      throw error;
    }
  }
}

export const deploymentService = new DeploymentService();

/**
 * Handle deployment via WebSocket with real-time progress updates
 */
export async function handleWebSocketDeployment(
  ws: any,
  fileData: string, // base64 encoded zip file
  projectName: string,
  type: ProjectType,
  deploymentId?: string,
  mode?: 'create' | 'update',
  envVars?: Record<string, string>
): Promise<void> {
  const effectiveDeploymentId = deploymentId || uuidv4();
  
  // Initialize status
  deploymentService.updateDeploymentStatus(effectiveDeploymentId, { 
    status: 'deploying', 
    progress: 0, 
    logs: ['Initializing deployment...'] 
  });

  const sendProgress = (step: string, message: string, progress: number) => {
    // Send to WS
    try {
      if (ws.readyState === 1) { // OPEN
        ws.send(JSON.stringify({ 
          type: 'deploy:progress', 
          step, 
          message, 
          progress 
        }));
      }
    } catch (e) { /* ignore ws errors */ }
    
    logger.info(`[WS Deploy] ${message} (${progress}%)`);
    
    // Update store
    deploymentService.updateDeploymentStatus(effectiveDeploymentId, {
      status: 'deploying',
      progress,
      logs: [message]
    });
  };

  const sendError = (error: string) => {
    try {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'deploy:error', error }));
      }
    } catch (e) { /* ignore */ }
    
    logger.error(`[WS Deploy] Error: ${error}`);
    
    deploymentService.updateDeploymentStatus(effectiveDeploymentId, {
      status: 'failed',
      error: error
    });
  };

  const sendSuccess = (project: ProjectConfig) => {
    try {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'deploy:success', project }));
      }
    } catch (e) { /* ignore */ }
    
    logger.info(`[WS Deploy] Success: ${project.name}`);
    
    deploymentService.updateDeploymentStatus(effectiveDeploymentId, {
      status: 'success',
      progress: 100,
      project
    });
  };

  try {
    // Decode base64 file data and save to temp file
    sendProgress('upload', 'Preparing deployment package...', 5);
    const tempDeployId = uuidv4(); // Internal ID for filesystem ops
    const tempFilePath = path.join(TEMP_DIR, `${tempDeployId}.zip`);
    const buffer = Buffer.from(fileData, 'base64');
    await fs.writeFile(tempFilePath, buffer);
    
    const project = await deploymentService.deployProject(tempFilePath, projectName, type, {
      deploymentId: effectiveDeploymentId,
      mode,
      envVars,
      onProgress: (step: string, message: string, progress: number) => {
        sendProgress(step, message, progress);
      }
    });
    
    sendProgress('complete', 'Deployment successful!', 100);
    sendSuccess(project);
    
    // Cleanup temp file
    if (await fs.pathExists(tempFilePath)) {
      await fs.remove(tempFilePath);
    }
    
  } catch (error: any) {
    logger.error('WebSocket deployment failed', error);
    sendError(error.message || 'Deployment failed');
  }
}