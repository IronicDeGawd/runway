import fs from 'fs-extra';
import path from 'path';
import { ProjectType, UploadType } from '@runway/shared';
import { logger } from '../utils/logger';

export interface UploadTypeResult {
  uploadType: UploadType;
  hasSource: boolean;
  hasBuildOutput: boolean;
  buildDir: string | null;
}

/**
 * Detects the type of upload based on project structure
 *
 * Upload types:
 * - 'full': Has source files + package.json with build script (can rebuild)
 * - 'dist': Only has build output, no source (cannot rebuild)
 * - 'build': Has build output from CLI local build (pre-built, no source)
 */
export class UploadTypeDetector {
  /**
   * Detect upload type for a project directory
   */
  static async detect(projectDir: string, projectType: ProjectType): Promise<UploadTypeResult> {
    const hasPackageJson = await fs.pathExists(path.join(projectDir, 'package.json'));

    // Check for source directories
    const hasSrc = await fs.pathExists(path.join(projectDir, 'src'));
    const hasPages = await fs.pathExists(path.join(projectDir, 'pages'));
    const hasApp = await fs.pathExists(path.join(projectDir, 'app'));

    // Check for build output directories
    const buildDirs = await this.detectBuildOutput(projectDir, projectType);
    const hasBuildOutput = buildDirs.exists;

    // Check for build script in package.json
    let hasBuildScript = false;
    if (hasPackageJson) {
      try {
        const pkg = await fs.readJson(path.join(projectDir, 'package.json'));
        hasBuildScript = !!(pkg.scripts?.build);
      } catch {
        hasBuildScript = false;
      }
    }

    // Determine if project has source indicators
    const hasSourceIndicators = hasPackageJson && (hasSrc || hasPages || hasApp);

    let uploadType: UploadType;
    let hasSource: boolean;

    // Node.js projects always have source (they run from source)
    if (projectType === 'node') {
      uploadType = 'full';
      hasSource = true;

      logger.debug('Upload type detection (Node.js):', { uploadType, hasSource });

      return {
        uploadType,
        hasSource,
        hasBuildOutput: false,
        buildDir: null,
      };
    }

    // Static sites don't have source concept
    if (projectType === 'static') {
      uploadType = 'dist';
      hasSource = false;

      logger.debug('Upload type detection (Static):', { uploadType, hasSource });

      return {
        uploadType,
        hasSource,
        hasBuildOutput: true,
        buildDir: projectDir,
      };
    }

    // React/Next.js detection logic
    if (!hasPackageJson && hasBuildOutput) {
      // Pure dist/build output only - no source code
      uploadType = 'dist';
      hasSource = false;
    } else if (hasSourceIndicators && hasBuildScript) {
      // Full project with source code - can rebuild
      uploadType = 'full';
      hasSource = true;
    } else if (hasBuildOutput && !hasBuildScript) {
      // Pre-built project (typically from CLI local build)
      // Has package.json but no build script means it was stripped
      uploadType = 'build';
      hasSource = false;
    } else if (hasBuildOutput && hasPackageJson && !hasSourceIndicators) {
      // Has build output and package.json but no src directory
      // This is a CLI local build where only dist was included
      uploadType = 'build';
      hasSource = false;
    } else {
      // Default to full - assume source exists
      uploadType = 'full';
      hasSource = hasSourceIndicators;
    }

    logger.debug('Upload type detection:', {
      projectType,
      hasPackageJson,
      hasSrc,
      hasPages,
      hasApp,
      hasBuildOutput,
      hasBuildScript,
      hasSourceIndicators,
      result: { uploadType, hasSource },
    });

    return {
      uploadType,
      hasSource,
      hasBuildOutput,
      buildDir: buildDirs.directory,
    };
  }

  /**
   * Detect build output directory based on project type
   */
  private static async detectBuildOutput(
    projectDir: string,
    projectType: ProjectType
  ): Promise<{ exists: boolean; directory: string | null }> {
    const buildDirCandidates: Record<ProjectType, string[]> = {
      react: ['dist', 'build'],
      next: ['.next'],
      node: [],
      static: ['.'],
    };

    const candidates = buildDirCandidates[projectType] || [];

    for (const dir of candidates) {
      const fullPath = path.join(projectDir, dir);
      if (await fs.pathExists(fullPath)) {
        // For React, check if it contains index.html
        if (projectType === 'react') {
          const hasIndex = await fs.pathExists(path.join(fullPath, 'index.html'));
          if (hasIndex) {
            return { exists: true, directory: fullPath };
          }
        }
        // For Next.js, check for BUILD_ID or server directory
        else if (projectType === 'next') {
          const hasBuildId = await fs.pathExists(path.join(fullPath, 'BUILD_ID'));
          const hasServer = await fs.pathExists(path.join(fullPath, 'server'));
          if (hasBuildId || hasServer) {
            return { exists: true, directory: fullPath };
          }
        }
        else {
          return { exists: true, directory: fullPath };
        }
      }
    }

    return { exists: false, directory: null };
  }
}

export const uploadTypeDetector = new UploadTypeDetector();
