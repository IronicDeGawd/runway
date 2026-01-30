import fs from 'fs-extra';
import path from 'path';
import { ProjectType } from '@runway/shared';
import { logger } from '../../utils/logger';
import { BuildOutputResult } from './types';
import { StaticSiteDetector } from './staticSiteDetector';
import { NextConfigParser } from './nextConfigParser';

/**
 * Detects existing build output artifacts in a project
 */
export class BuildOutputDetector {
  /**
   * Build output directories to check by project type
   */
  private static readonly BUILD_DIRS: Record<ProjectType, string[]> = {
    react: ['dist', 'build'],
    next: ['out', '.next'], // Check 'out' first for static export
    node: ['dist', 'build', 'lib'],
    static: [],
  };

  /**
   * Detect build output for any project type
   */
  static async detect(
    projectDir: string,
    projectType: ProjectType
  ): Promise<BuildOutputResult> {
    switch (projectType) {
      case 'react':
        return this.detectReactBuild(projectDir);
      case 'next':
        return this.detectNextBuild(projectDir);
      case 'node':
        return this.detectNodeBuild(projectDir);
      case 'static':
        return this.detectStaticBuild(projectDir);
      default:
        return { exists: false, directory: null, isComplete: false, outputType: null };
    }
  }

  /**
   * Detect React (Vite/CRA) build output
   */
  static async detectReactBuild(projectDir: string): Promise<BuildOutputResult> {
    // Check for Vite output (dist/)
    const distPath = path.join(projectDir, 'dist');
    if (await fs.pathExists(distPath)) {
      const isComplete = await StaticSiteDetector.isBuildOutput(distPath);
      if (isComplete) {
        logger.debug('React Vite build detected: dist/');
        return {
          exists: true,
          directory: 'dist',
          isComplete: true,
          outputType: 'react-vite',
        };
      }
    }

    // Check for CRA output (build/)
    const buildPath = path.join(projectDir, 'build');
    if (await fs.pathExists(buildPath)) {
      const isComplete = await StaticSiteDetector.isBuildOutput(buildPath);
      if (isComplete) {
        logger.debug('React CRA build detected: build/');
        return {
          exists: true,
          directory: 'build',
          isComplete: true,
          outputType: 'react-cra',
        };
      }
    }

    return { exists: false, directory: null, isComplete: false, outputType: null };
  }

  /**
   * Detect Next.js build output (static export or server build)
   */
  static async detectNextBuild(projectDir: string): Promise<BuildOutputResult> {
    // Check for static export first (out/)
    const outPath = path.join(projectDir, 'out');
    if (await fs.pathExists(outPath)) {
      const files = await fs.readdir(outPath);
      if (files.length > 0) {
        const hasIndex = files.includes('index.html');
        logger.debug('Next.js static export detected: out/');
        return {
          exists: true,
          directory: 'out',
          isComplete: hasIndex,
          outputType: 'next-static',
        };
      }
    }

    // Check for server build (.next/)
    const nextPath = path.join(projectDir, '.next');
    if (await fs.pathExists(nextPath)) {
      const files = await fs.readdir(nextPath);
      const hasServerFiles = files.includes('server') || files.includes('static');
      logger.debug('Next.js server build detected: .next/');
      return {
        exists: true,
        directory: '.next',
        isComplete: hasServerFiles,
        outputType: 'next-server',
      };
    }

    return { exists: false, directory: null, isComplete: false, outputType: null };
  }

  /**
   * Detect Node.js compiled output (TypeScript, etc.)
   */
  static async detectNodeBuild(projectDir: string): Promise<BuildOutputResult> {
    const buildDirs = ['dist', 'build', 'lib'];

    for (const dir of buildDirs) {
      const dirPath = path.join(projectDir, dir);
      if (await fs.pathExists(dirPath)) {
        const files = await fs.readdir(dirPath);
        // Check for JS files (compiled output)
        const hasJsFiles = files.some(f => f.endsWith('.js') || f.endsWith('.mjs'));
        if (hasJsFiles) {
          logger.debug(`Node.js compiled build detected: ${dir}/`);
          return {
            exists: true,
            directory: dir,
            isComplete: true,
            outputType: 'node-compiled',
          };
        }
      }
    }

    return { exists: false, directory: null, isComplete: false, outputType: null };
  }

  /**
   * Detect static site (already built/ready to serve)
   */
  static async detectStaticBuild(projectDir: string): Promise<BuildOutputResult> {
    const result = await StaticSiteDetector.detect(projectDir);

    if (result.isStatic) {
      return {
        exists: true,
        directory: '.',
        isComplete: result.entryFile !== null,
        outputType: 'static',
      };
    }

    return { exists: false, directory: null, isComplete: false, outputType: null };
  }

  /**
   * Check if project has pre-built artifacts ready to serve
   */
  static async isPrebuilt(
    projectDir: string,
    projectType: ProjectType
  ): Promise<boolean> {
    const result = await this.detect(projectDir, projectType);
    return result.exists && result.isComplete;
  }

  /**
   * Get the directory to serve for a pre-built project
   */
  static async getServeDir(
    projectDir: string,
    projectType: ProjectType
  ): Promise<string | null> {
    const result = await this.detect(projectDir, projectType);
    return result.directory;
  }
}
