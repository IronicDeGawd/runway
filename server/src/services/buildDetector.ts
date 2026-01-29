import fs from 'fs-extra';
import path from 'path';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import { ProjectType } from '@runway/shared';

export class BuildDetector {
  private static readonly BUILD_OUTPUTS = {
    react: ['dist'], // Vite only
    next: ['.next'],
    node: [], // Node apps don't have build output
  };

  /**
   * Detect the build output directory for a project
   * Returns the full path to the build directory or null if not found
   */
  static async detectBuildOutput(
    projectDir: string,
    type: ProjectType
  ): Promise<string | null> {
    const possibleOutputs = this.BUILD_OUTPUTS[type] || [];

    for (const output of possibleOutputs) {
      const fullPath = path.join(projectDir, output);

      try {
        if (await fs.pathExists(fullPath)) {
          const files = await fs.readdir(fullPath);
          
          // Verify directory is not empty
          if (files.length > 0) {
            logger.info(`Build output detected: ${fullPath}`);
            return fullPath;
          }
        }
      } catch (error) {
        logger.warn(`Error checking build output ${fullPath}`, error);
        continue;
      }
    }

    return null;
  }

  /**
   * Verify build output exists and contains expected files
   * Throws error if verification fails
   */
  static async verifyBuildOutput(
    projectDir: string,
    type: ProjectType
  ): Promise<string> {
    const buildPath = await this.detectBuildOutput(projectDir, type);

    if (!buildPath) {
      const expected = this.BUILD_OUTPUTS[type].join(', ');
      throw new AppError(
        `Build verification failed: No build output found. Expected: ${expected}`,
        500
      );
    }

    // Additional verification based on project type
    await this.verifyBuildContent(buildPath, type);

    return buildPath;
  }

  /**
   * Verify build directory contains expected files based on project type
   */
  private static async verifyBuildContent(
    buildPath: string,
    type: ProjectType
  ): Promise<void> {
    switch (type) {
      case 'react':
        // Vite React apps should have index.html
        const indexPath = path.join(buildPath, 'index.html');
        if (!(await fs.pathExists(indexPath))) {
          throw new AppError(
            'Build verification failed: index.html not found in dist/',
            500
          );
        }
        break;

      case 'next':
        // Next.js should have server components
        const serverPath = path.join(buildPath, 'server');
        if (!(await fs.pathExists(serverPath))) {
          logger.warn('Next.js build may be incomplete - server files not found');
        }
        break;

      case 'node':
        // Node apps might not have build output
        break;
    }
  }

  /**
   * Detect package manager from lock files
   */
  static async detectPackageManager(projectDir: string): Promise<'npm' | 'yarn' | 'pnpm'> {
    if (await fs.pathExists(path.join(projectDir, 'pnpm-lock.yaml'))) {
      return 'pnpm';
    }
    if (await fs.pathExists(path.join(projectDir, 'yarn.lock'))) {
      return 'yarn';
    }
    return 'npm';
  }

  /**
   * Read package.json and detect project type
   */
  static async detectProjectType(projectDir: string): Promise<ProjectType> {
    const pkgPath = path.join(projectDir, 'package.json');
    
    if (!(await fs.pathExists(pkgPath))) {
      throw new AppError('package.json not found', 400);
    }

    const pkg = await fs.readJson(pkgPath);
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    // Check for Next.js
    if (deps.next) {
      return 'next';
    }

    // Check for React (Vite)
    if (deps.react && !deps.next) {
      return 'react';
    }

    // Default to Node.js
    return 'node';
  }

  /**
   * Validate that required scripts exist in package.json
   */
  static async validateBuildScripts(
    projectDir: string,
    type: ProjectType
  ): Promise<void> {
    const pkgPath = path.join(projectDir, 'package.json');
    const pkg = await fs.readJson(pkgPath);
    const scripts = pkg.scripts || {};

    switch (type) {
      case 'react':
        if (!scripts.build) {
          throw new AppError(
            'Missing "build" script in package.json',
            400
          );
        }
        break;

      case 'next':
        if (!scripts.build || !scripts.start) {
          throw new AppError(
            'Missing "build" or "start" scripts in package.json',
            400
          );
        }
        break;

      case 'node':
        if (!scripts.start) {
          throw new AppError(
            'Missing "start" script in package.json',
            400
          );
        }
        break;
    }
  }
}
