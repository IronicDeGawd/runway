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

  /**
   * Configure base path for React/Next.js projects to work in subdirectories
   */
  private async configureBasePath(dir: string, projectName: string, type: ProjectType): Promise<void> {
    const basePath = `/app/${projectName}`;
    
    if (type === 'react') {
      // Vite/React: modify vite.config.ts or vite.config.js
      const viteConfigs = ['vite.config.ts', 'vite.config.js', 'vite.config.mjs'];
      
      for (const configFile of viteConfigs) {
        const configPath = path.join(dir, configFile);
        if (await fs.pathExists(configPath)) {
          logger.info(`Configuring base path in ${configFile}`);
          let content = await fs.readFile(configPath, 'utf-8');
          
          // Check if base is already configured
          if (content.includes('base:')) {
            // Replace existing base configuration
            content = content.replace(/base:\s*['"\`][^'"\`]*['"\`]/g, `base: '${basePath}'`);
          } else {
            // Add base to defineConfig
            content = content.replace(
              /(defineConfig\s*\(\s*{)/,
              `$1\n  base: '${basePath}',`
            );
          }
          
          await fs.writeFile(configPath, content, 'utf-8');
          logger.info(`✅ Base path set to ${basePath} in ${configFile}`);
          
          // Also update index.html to add base tag for public assets
          const indexPath = path.join(dir, 'index.html');
          if (await fs.pathExists(indexPath)) {
            let html = await fs.readFile(indexPath, 'utf-8');
            // Inject base tag after <head> if not already present
            if (!html.includes('<base')) {
              html = html.replace(/<head>/i, `<head>\n  <base href="${basePath}/">`);
              await fs.writeFile(indexPath, html, 'utf-8');
              logger.info(`✅ Added <base> tag to index.html`);
            }
          }
          
          return;
        }
      }
      
      logger.warn('No vite.config found, assets may not load correctly in subdirectory');
      
    } else if (type === 'next') {
      // Next.js: modify next.config.js/mjs
      const nextConfigs = ['next.config.js', 'next.config.mjs'];
      
      for (const configFile of nextConfigs) {
        const configPath = path.join(dir, configFile);
        if (await fs.pathExists(configPath)) {
          logger.info(`Configuring base path in ${configFile}`);
          let content = await fs.readFile(configPath, 'utf-8');
          
          // Add basePath and assetPrefix to Next.js config
          if (content.includes('module.exports')) {
            // CommonJS format
            content = content.replace(
              /(module\.exports\s*=\s*{)/,
              `$1\n  basePath: '${basePath}',\n  assetPrefix: '${basePath}',`
            );
          } else if (content.includes('export default')) {
            // ES module format
            content = content.replace(
              /(export\s+default\s+{)/,
              `$1\n  basePath: '${basePath}',\n  assetPrefix: '${basePath}',`
            );
          }
          
          await fs.writeFile(configPath, content, 'utf-8');
          logger.info(`✅ Base path and asset prefix set to ${basePath} in ${configFile}`);
          return;
        }
      }
      
      logger.warn('No next.config found, assets may not load correctly in subdirectory');
    }
  }
  
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

  private async buildProject(dir: string, manager: PackageManager, projectId: string): Promise<void> {
    try {
      const pkgJsonPath = path.join(dir, 'package.json');
      const pkgJson = await fs.readJson(pkgJsonPath);
      
      if (pkgJson.scripts && pkgJson.scripts.build) {
        logger.info(`Building project in ${dir}`);
        const envVars = await envService.getEnv(projectId);
        
        const buildCmd = `${manager} run build`;
        
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

  async deployProject(filePath: string, projectName: string, type: ProjectType): Promise<ProjectConfig> {
    const deployId = uuidv4();
    const stagingDir = path.join(TEMP_DIR, deployId);
    let portAllocated = false;
    let newPort: number | null = null;
    
    logger.info(`Starting deployment ${deployId} for ${projectName}`);

    try {
      // 1. Extract zip
      await extractZip(filePath, stagingDir);
      logger.info('✅ Zip extracted');
      
      // 2. Validate package.json exists
      const pkgJsonPath = path.join(stagingDir, 'package.json');
      if (!await fs.pathExists(pkgJsonPath)) {
        throw new AppError('Invalid project: package.json missing', 400);
      }

      // 3. Detect package manager
      const pkgManager = await this.detectPackageManager(stagingDir);
      logger.info(`Detected package manager: ${pkgManager}`);

      // 4. Install dependencies
      await this.installDependencies(stagingDir, pkgManager);
      logger.info('✅ Dependencies installed');

      // 5. Configure base path for subdirectory routing
      if (type === 'react' || type === 'next') {
        await this.configureBasePath(stagingDir, projectName, type);
      }

      // 6. Build the project (if required)
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
        logger.info('Stopped existing PM2 process');
      }

      // 9. Atomic directory swap
      const targetDir = path.join(APPS_DIR, projectId);
      if (await fs.pathExists(targetDir)) {
        await fs.remove(targetDir); 
      }
      await fs.move(stagingDir, targetDir);
      logger.info(`Deployed to ${targetDir}`);

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
      logger.info('✅ Project registered');

      // 11. Start PM2 process (if not static React)
      if (type !== 'react') {
        await pm2Service.startProject(newConfig);
        logger.info('PM2 process started');
        
        // Quick health check
        await this.waitForProcessStart(newConfig);
      }

      // 12. ✅ CRITICAL FIX: Update Caddy with modular config
      await caddyConfigManager.updateProjectConfig(newConfig);
      logger.info('✅ Caddy config updated');

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

/**
 * Handle deployment via WebSocket with real-time progress updates
 */
export async function handleWebSocketDeployment(
  ws: any,
  fileData: string, // base64 encoded zip file
  projectName: string,
  type: ProjectType
): Promise<void> {
  const sendProgress = (step: string, message: string, progress: number) => {
    ws.send(JSON.stringify({ 
      type: 'deploy:progress', 
      step, 
      message, 
      progress 
    }));
    logger.info(`[WS Deploy] ${message} (${progress}%)`);
  };

  const sendError = (error: string) => {
    ws.send(JSON.stringify({ type: 'deploy:error', error }));
    logger.error(`[WS Deploy] Error: ${error}`);
  };

  const sendSuccess = (project: ProjectConfig) => {
    ws.send(JSON.stringify({ type: 'deploy:success', project }));
    logger.info(`[WS Deploy] Success: ${project.name}`);
  };

  try {
    // Decode base64 file data and save to temp file
    sendProgress('upload', 'Preparing deployment package...', 5);
    const deployId = uuidv4();
    const tempFilePath = path.join(TEMP_DIR, `${deployId}.zip`);
    const buffer = Buffer.from(fileData, 'base64');
    await fs.writeFile(tempFilePath, buffer);
    
    sendProgress('upload', 'Package received, extracting...', 15);
    const stagingDir = path.join(TEMP_DIR, deployId);
    await extractZip(tempFilePath, stagingDir);
    sendProgress('install', 'Validating project structure...', 20);
    
    // Validate package.json
    const pkgJsonPath = path.join(stagingDir, 'package.json');
    if (!await fs.pathExists(pkgJsonPath)) {
      throw new AppError('Invalid project: package.json missing', 400);
    }
    
    sendProgress('install', 'Installing dependencies...', 25);
    const pkgManager = await deploymentService['detectPackageManager'](stagingDir);
    await deploymentService['installDependencies'](stagingDir, pkgManager);
    
    sendProgress('build', 'Dependencies installed, starting build...', 50);
    
    // Build if needed
    if (type === 'react' || type === 'next') {
      let existingProject = (await projectRegistry.getAll()).find(p => p.name === projectName);
      let pid = existingProject ? existingProject.id : 'new-project-placeholder';
      await deploymentService['buildProject'](stagingDir, pkgManager, pid);
      sendProgress('build', 'Build completed successfully', 70);
    }
    
    sendProgress('deploy', 'Deploying application...', 75);
    
    // Continue with rest of deployment
    const project = await deploymentService.deployProject(tempFilePath, projectName, type);
    
    sendProgress('deploy', 'Configuring reverse proxy...', 95);
    sendProgress('complete', 'Deployment successful!', 100);
    sendSuccess(project);
    
    // Cleanup temp file
    await fs.remove(tempFilePath);
    await fs.remove(stagingDir);
    
  } catch (error: any) {
    logger.error('WebSocket deployment failed', error);
    sendError(error.message || 'Deployment failed');
  }
}