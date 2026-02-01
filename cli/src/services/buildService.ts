import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { ProjectType, PackageManager } from '../types';
import { logger } from '../utils/logger';

export interface BuildOptions {
  projectPath: string;
  projectType: ProjectType;
  projectName: string;
  packageManager: PackageManager;
  envFile?: string;
}

export interface BuildResult {
  success: boolean;
  outputDir: string;
  duration: number;
  error?: string;
}

export class BuildService {
  async build(options: BuildOptions): Promise<BuildResult> {
    const startTime = Date.now();
    const { projectPath, projectType, projectName, packageManager, envFile } = options;

    // Static projects don't need building
    if (projectType === 'static') {
      logger.info('Static project - no build required');
      return {
        success: true,
        outputDir: projectPath,
        duration: Date.now() - startTime,
      };
    }

    // Check if build script exists (especially important for Node.js)
    const pkgPath = path.join(projectPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (!pkg.scripts?.build) {
        // Node.js projects often don't have a build script
        if (projectType === 'node') {
          logger.info('Node.js project - no build script found, skipping build');
          return {
            success: true,
            outputDir: projectPath,
            duration: Date.now() - startTime,
          };
        }
        // For React/Next, a build script is required
        return {
          success: false,
          outputDir: projectPath,
          duration: Date.now() - startTime,
          error: 'Missing "build" script in package.json',
        };
      }
    }

    // Load environment variables from file if provided
    const env: Record<string, string> = { ...process.env as Record<string, string> };

    if (envFile && fs.existsSync(envFile)) {
      const envContent = fs.readFileSync(envFile, 'utf-8');
      for (const line of envContent.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...valueParts] = trimmed.split('=');
          if (key) {
            env[key] = valueParts.join('=');
          }
        }
      }
    }

    // Check if dependencies need to be installed
    const nodeModulesPath = path.join(projectPath, 'node_modules');
    if (!fs.existsSync(nodeModulesPath)) {
      logger.info('Installing dependencies...');
      const installArgs = packageManager === 'yarn' ? [] : ['install'];
      try {
        await this.runCommand(packageManager, installArgs, projectPath, env);
        logger.success('Dependencies installed');
      } catch (error) {
        return {
          success: false,
          outputDir: projectPath,
          duration: Date.now() - startTime,
          error: `Failed to install dependencies: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    // Determine build command based on project type
    const buildArgs = this.getBuildArgs(projectType, projectName, packageManager);
    const outputDir = this.getOutputDir(projectPath, projectType);

    logger.info(`Building ${projectType} project...`);
    logger.dim(`Command: ${packageManager} ${buildArgs.join(' ')}`);

    try {
      await this.runCommand(packageManager, buildArgs, projectPath, env);

      // Verify build output exists
      if (!fs.existsSync(outputDir)) {
        return {
          success: false,
          outputDir,
          duration: Date.now() - startTime,
          error: `Build output directory not found: ${outputDir}`,
        };
      }

      return {
        success: true,
        outputDir,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        outputDir,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private getBuildArgs(projectType: ProjectType, projectName: string, packageManager: PackageManager): string[] {
    const safeName = projectName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const basePath = `/app/${safeName}`;

    const baseArgs = ['run', 'build'];

    if (projectType === 'react') {
      // Pass base path for Vite or CRA
      if (packageManager === 'npm') {
        return [...baseArgs, '--', `--base=${basePath}`];
      } else {
        return [...baseArgs, `--base=${basePath}`];
      }
    }

    // For Next.js and Node.js, just run the build script
    return baseArgs;
  }

  private getOutputDir(projectPath: string, projectType: ProjectType): string {
    switch (projectType) {
      case 'react':
        // Check for Vite vs CRA
        if (fs.existsSync(path.join(projectPath, 'vite.config.ts')) ||
            fs.existsSync(path.join(projectPath, 'vite.config.js'))) {
          return path.join(projectPath, 'dist');
        }
        return path.join(projectPath, 'build');

      case 'next':
        return path.join(projectPath, '.next');

      case 'node':
        // For Node.js, the project root is the "output"
        return projectPath;

      case 'static':
        // For static sites, the project root is the "output"
        return projectPath;
    }
  }

  private runCommand(command: string, args: string[], cwd: string, env: Record<string, string>): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, {
        cwd,
        env,
        stdio: 'pipe',
        shell: true,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
        // Print build output in real-time
        process.stdout.write(data);
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
        process.stderr.write(data);
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Build failed with exit code ${code}\n${stderr}`));
        }
      });

      proc.on('error', (error) => {
        reject(error);
      });
    });
  }
}

export const buildService = new BuildService();
