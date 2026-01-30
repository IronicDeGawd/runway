import fs from 'fs-extra';
import path from 'path';
import { ProjectType } from '@runway/shared';
import { logger } from '../../utils/logger';
import { TypeDetectionResult, PackageJson } from './types';
import { StaticSiteDetector } from './staticSiteDetector';
import { NextConfigParser } from './nextConfigParser';

/**
 * Detects project type from source files and configuration
 */
export class ProjectTypeDetector {
  /**
   * Detect project type from directory contents
   */
  static async detect(
    projectDir: string,
    declaredType?: ProjectType
  ): Promise<TypeDetectionResult> {
    const hasPackageJson = await fs.pathExists(path.join(projectDir, 'package.json'));

    // If no package.json, check for static site
    if (!hasPackageJson) {
      return this.detectWithoutPackageJson(projectDir);
    }

    // Read package.json for detection
    const pkg = await this.readPackageJson(projectDir);
    const detectionResult = await this.detectFromPackageJson(projectDir, pkg);

    // If type was declared, validate it matches
    if (declaredType && declaredType !== detectionResult.type) {
      logger.warn(
        `Declared type '${declaredType}' differs from detected '${detectionResult.type}'`
      );
      detectionResult.indicators.push(`declared-type-mismatch:${declaredType}`);
    }

    return detectionResult;
  }

  /**
   * Detect type when no package.json exists
   */
  private static async detectWithoutPackageJson(
    projectDir: string
  ): Promise<TypeDetectionResult> {
    const staticResult = await StaticSiteDetector.detect(projectDir);

    if (staticResult.isStatic) {
      return {
        type: 'static',
        confidence: 'high',
        indicators: ['no-package-json', 'has-index-html'],
        hasBuildScript: false,
        hasStartScript: false,
      };
    }

    // No package.json and no index.html - cannot determine type
    return {
      type: 'static',
      confidence: 'low',
      indicators: ['no-package-json', 'no-index-html', 'assumed-static'],
      hasBuildScript: false,
      hasStartScript: false,
    };
  }

  /**
   * Detect type from package.json contents
   */
  private static async detectFromPackageJson(
    projectDir: string,
    pkg: PackageJson
  ): Promise<TypeDetectionResult> {
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const scripts = pkg.scripts || {};
    const indicators: string[] = [];

    const hasBuildScript = !!scripts.build;
    const hasStartScript = !!scripts.start;

    // Check for Next.js
    if (deps.next) {
      indicators.push('has-next-dependency');

      // Check if it's a static export
      const isStaticExport = await NextConfigParser.isStaticExport(projectDir);
      if (isStaticExport) {
        indicators.push('next-static-export');
        return {
          type: 'static', // Treat static Next.js as static
          confidence: 'high',
          indicators,
          hasBuildScript,
          hasStartScript,
        };
      }

      return {
        type: 'next',
        confidence: 'high',
        indicators,
        hasBuildScript,
        hasStartScript,
      };
    }

    // Check for React (without Next.js)
    if (deps.react || deps['react-dom']) {
      indicators.push('has-react-dependency');

      // Check for build tools
      if (deps.vite) {
        indicators.push('has-vite');
      }
      if (deps['react-scripts']) {
        indicators.push('has-react-scripts');
      }

      return {
        type: 'react',
        confidence: 'high',
        indicators,
        hasBuildScript,
        hasStartScript,
      };
    }

    // Check for Node.js server indicators
    if (this.isNodeServer(pkg, projectDir)) {
      indicators.push('node-server-indicators');

      if (deps.express) indicators.push('has-express');
      if (deps.fastify) indicators.push('has-fastify');
      if (deps.koa) indicators.push('has-koa');
      if (deps.hapi || deps['@hapi/hapi']) indicators.push('has-hapi');

      return {
        type: 'node',
        confidence: 'high',
        indicators,
        hasBuildScript,
        hasStartScript,
      };
    }

    // Check for static site with package.json (build tools only)
    const staticResult = await StaticSiteDetector.detect(projectDir);
    if (staticResult.isStatic && !hasStartScript) {
      indicators.push('has-index-html', 'no-start-script');
      return {
        type: 'static',
        confidence: 'medium',
        indicators,
        hasBuildScript,
        hasStartScript,
      };
    }

    // Default to Node.js if has start script
    if (hasStartScript) {
      indicators.push('has-start-script', 'default-to-node');
      return {
        type: 'node',
        confidence: 'medium',
        indicators,
        hasBuildScript,
        hasStartScript,
      };
    }

    // Fallback to static
    indicators.push('fallback-to-static');
    return {
      type: 'static',
      confidence: 'low',
      indicators,
      hasBuildScript,
      hasStartScript,
    };
  }

  /**
   * Check if project looks like a Node.js server
   */
  private static isNodeServer(pkg: PackageJson, projectDir: string): boolean {
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const scripts = pkg.scripts || {};

    // Server framework detection
    const hasServerFramework =
      deps.express ||
      deps.fastify ||
      deps.koa ||
      deps.hapi ||
      deps['@hapi/hapi'] ||
      deps.restify ||
      deps.nest ||
      deps['@nestjs/core'];

    if (hasServerFramework) return true;

    // Has start script pointing to JS file
    if (scripts.start) {
      const startScript = scripts.start;
      if (
        startScript.includes('node ') ||
        startScript.includes('ts-node') ||
        startScript.includes('nodemon')
      ) {
        return true;
      }
    }

    // Has main entry point
    if (pkg.main) {
      return true;
    }

    return false;
  }

  /**
   * Read package.json from directory
   */
  static async readPackageJson(projectDir: string): Promise<PackageJson> {
    const pkgPath = path.join(projectDir, 'package.json');
    if (!(await fs.pathExists(pkgPath))) {
      return {};
    }
    return fs.readJson(pkgPath);
  }

  /**
   * Check if project has a build script
   */
  static async hasBuildScript(projectDir: string): Promise<boolean> {
    const pkg = await this.readPackageJson(projectDir);
    return !!pkg.scripts?.build;
  }

  /**
   * Check if project has a start script
   */
  static async hasStartScript(projectDir: string): Promise<boolean> {
    const pkg = await this.readPackageJson(projectDir);
    return !!pkg.scripts?.start;
  }
}
