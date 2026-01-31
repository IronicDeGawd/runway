import fs from 'fs-extra';
import path from 'path';
import { logger } from '../../utils/logger';
import { BuildOutputResult } from './types';
import { StaticSiteDetector } from './staticSiteDetector';

/**
 * Generic build output detector
 * No framework-specific knowledge - checks common build directories
 *
 * Per Analysis Responsibility Guidelines:
 * - Does NOT detect framework types
 * - Only determines if upload appears to be pre-built vs source
 * - Adding new frameworks requires ZERO changes here
 */
export class BuildOutputDetector {
  /**
   * Common build output directories (checked in order)
   * These are generic - not tied to any specific framework
   */
  private static readonly COMMON_BUILD_DIRS = [
    'dist',    // Vite, Rollup, Webpack, TypeScript
    'build',   // CRA, various tools
    'out',     // Next.js static export, other tools
    '.next',   // Next.js server build
    'lib',     // TypeScript library output
    'public',  // Some static site generators
  ];

  /**
   * Detect build output generically - no framework knowledge
   * Checks common build directories for significant content
   */
  static async detect(projectDir: string): Promise<BuildOutputResult> {
    for (const dir of this.COMMON_BUILD_DIRS) {
      const dirPath = path.join(projectDir, dir);

      if (await fs.pathExists(dirPath)) {
        const stat = await fs.stat(dirPath);
        if (!stat.isDirectory()) continue;

        const hasContent = await this.hasSignificantContent(dirPath);
        if (hasContent) {
          const isComplete = await this.appearsComplete(dirPath);
          logger.debug(`Build output detected: ${dir}/ (complete: ${isComplete})`);
          return {
            exists: true,
            directory: dir,
            isComplete,
          };
        }
      }
    }

    // Check if root directory itself is a static site (pre-built)
    const rootIsStatic = await StaticSiteDetector.detect(projectDir);
    if (rootIsStatic.isStatic && !await this.hasSourceIndicators(projectDir)) {
      logger.debug('Root directory appears to be pre-built static site');
      return {
        exists: true,
        directory: '.',
        isComplete: rootIsStatic.entryFile !== null,
      };
    }

    return { exists: false, directory: null, isComplete: false };
  }

  /**
   * Check if directory has significant content (not empty or near-empty)
   */
  private static async hasSignificantContent(dir: string): Promise<boolean> {
    try {
      const files = await fs.readdir(dir);
      // Consider significant if has more than just metadata files
      const significantFiles = files.filter(f =>
        !f.startsWith('.') &&
        f !== 'README.md' &&
        f !== 'LICENSE'
      );
      return significantFiles.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Generic completeness check - does the build output appear ready to serve?
   * Checks for index.html OR significant JS/CSS files
   */
  private static async appearsComplete(dir: string): Promise<boolean> {
    try {
      // Check if it looks like static build output
      const hasStaticOutput = await StaticSiteDetector.isBuildOutput(dir);
      if (hasStaticOutput) return true;

      // For server builds, check for JS files
      const files = await fs.readdir(dir);
      const hasJsFiles = files.some(f =>
        f.endsWith('.js') ||
        f.endsWith('.mjs') ||
        f.endsWith('.cjs')
      );

      // Has server directory (Next.js, etc.)
      const hasServerDir = files.includes('server') || files.includes('standalone');

      return hasJsFiles || hasServerDir;
    } catch {
      return false;
    }
  }

  /**
   * Check if directory has source code indicators (not just build output)
   */
  private static async hasSourceIndicators(dir: string): Promise<boolean> {
    const sourceIndicators = [
      'package.json',
      'src',
      'source',
      'app',
      'pages',
      'components',
    ];

    for (const indicator of sourceIndicators) {
      if (await fs.pathExists(path.join(dir, indicator))) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if project has pre-built artifacts ready to serve
   */
  static async isPrebuilt(projectDir: string): Promise<boolean> {
    const result = await this.detect(projectDir);
    return result.exists && result.isComplete;
  }

  /**
   * Get the directory to serve for a pre-built project
   */
  static async getServeDir(projectDir: string): Promise<string | null> {
    const result = await this.detect(projectDir);
    return result.directory;
  }
}
