import fs from 'fs-extra';
import path from 'path';
import { ProjectType, PackageManager } from '@runway/shared';
import { logger } from '../utils/logger';
import {
  DeployAnalysis,
  DeployWarning,
  AnalyzeOptions,
  PackageJson,
} from './detection/types';
import { ProjectTypeDetector } from './detection/projectTypeDetector';
import { BuildOutputDetector } from './detection/buildOutputDetector';
import { StaticSiteDetector } from './detection/staticSiteDetector';
import { NextConfigParser } from './detection/nextConfigParser';

/**
 * Orchestrates package analysis for deployment decisions
 * All detection logic is delegated to specialized modules
 */
export class DeployAnalyzer {
  /**
   * Analyze an extracted package to determine deployment strategy
   */
  static async analyze(
    extractedPath: string,
    options: AnalyzeOptions = {}
  ): Promise<DeployAnalysis> {
    logger.info(`Analyzing package at: ${extractedPath}`);

    const warnings: DeployWarning[] = [];

    // Check for package.json
    const hasPackageJson = await fs.pathExists(
      path.join(extractedPath, 'package.json')
    );

    // Read package.json if exists
    let packageJson: PackageJson | undefined;
    if (hasPackageJson) {
      packageJson = await ProjectTypeDetector.readPackageJson(extractedPath);
    }

    // Detect package manager
    const packageManager = await this.detectPackageManager(extractedPath, hasPackageJson);

    // Detect project type
    const typeResult = await ProjectTypeDetector.detect(
      extractedPath,
      options.declaredType
    );

    // Check if declared type matches detected
    const typeMatchesDeclared =
      !options.declaredType || options.declaredType === typeResult.type;

    if (!typeMatchesDeclared) {
      warnings.push({
        level: 'warning',
        message: `Declared type '${options.declaredType}' differs from detected '${typeResult.type}'`,
        code: 'TYPE_MISMATCH',
      });
    }

    // Detect build output
    const buildResult = await BuildOutputDetector.detect(
      extractedPath,
      typeResult.type
    );

    // Check for Next.js static export
    const isNextStaticExport =
      typeResult.type === 'next'
        ? await NextConfigParser.isStaticExport(extractedPath)
        : false;

    // Determine if build is required
    const requiresBuild = this.determineIfBuildRequired(
      typeResult,
      buildResult,
      options.forceBuild
    );

    // Determine if this is a prebuilt project
    const isPrebuiltProject = buildResult.exists && buildResult.isComplete;

    // Determine static site status
    const isStaticSite =
      typeResult.type === 'static' ||
      isNextStaticExport ||
      (typeResult.type === 'react' && isPrebuiltProject);

    // Determine deployment strategy
    const strategy = this.determineStrategy(
      typeResult.type,
      isPrebuiltProject,
      isStaticSite,
      requiresBuild
    );

    // Determine serve method
    const serveMethod = this.determineServeMethod(typeResult.type, isStaticSite);

    // Determine serve directory
    const serveDir = this.determineServeDir(
      typeResult.type,
      buildResult.directory,
      isNextStaticExport
    );

    // Check if server-side build is required (needs confirmation)
    const requiresServerBuild = requiresBuild && !isPrebuiltProject;

    if (requiresServerBuild) {
      warnings.push({
        level: 'warning',
        message: 'Server-side build will consume significant resources on small instances',
        code: 'SERVER_BUILD',
      });
    }

    // Check if we're skipping build due to existing output
    if (buildResult.exists && !options.forceBuild && !requiresBuild) {
      warnings.push({
        level: 'info',
        message: `Existing build output found in ${buildResult.directory}/, will skip rebuild`,
        code: 'SKIP_BUILD',
      });
    }

    // Add warnings for missing scripts
    if (requiresBuild && !typeResult.hasBuildScript) {
      warnings.push({
        level: 'critical',
        message: 'Build is required but no "build" script found in package.json',
        code: 'MISSING_BUILD_SCRIPT',
      });
    }

    if (
      serveMethod === 'pm2-proxy' &&
      !typeResult.hasStartScript &&
      typeResult.type !== 'static'
    ) {
      warnings.push({
        level: 'critical',
        message: 'No "start" script found in package.json - required for PM2',
        code: 'MISSING_START_SCRIPT',
      });
    }

    // Incomplete build warning
    if (buildResult.exists && !buildResult.isComplete) {
      warnings.push({
        level: 'warning',
        message: 'Build output appears incomplete - consider rebuilding',
        code: 'INCOMPLETE_BUILD',
      });
    }

    const analysis: DeployAnalysis = {
      // Detection results
      detectedType: typeResult.type,
      declaredType: options.declaredType,
      typeMatchesDeclared,

      // Package state
      hasPackageJson,
      packageManager,
      packageJson,

      // Build state
      hasBuildOutput: buildResult.exists,
      buildOutputDir: buildResult.directory,
      buildOutputType: buildResult.outputType,
      requiresBuild,
      hasBuildScript: typeResult.hasBuildScript,

      // Special cases
      isStaticSite,
      isNextStaticExport,
      isPrebuiltProject,

      // Deployment strategy
      strategy,
      serveMethod,
      serveDir,

      // Warnings
      warnings,

      // Confirmation required for server builds
      requiresConfirmation: requiresServerBuild,
      confirmationReason: requiresServerBuild
        ? 'Server-side build required'
        : undefined,
    };

    logger.info(
      `Analysis complete: type=${analysis.detectedType}, strategy=${analysis.strategy}, ` +
        `requiresBuild=${analysis.requiresBuild}, warnings=${warnings.length}`
    );

    return analysis;
  }

  /**
   * Detect package manager from lock files
   */
  private static async detectPackageManager(
    projectDir: string,
    hasPackageJson: boolean
  ): Promise<PackageManager> {
    if (!hasPackageJson) {
      return 'none';
    }

    if (await fs.pathExists(path.join(projectDir, 'pnpm-lock.yaml'))) {
      return 'pnpm';
    }
    if (await fs.pathExists(path.join(projectDir, 'yarn.lock'))) {
      return 'yarn';
    }
    if (await fs.pathExists(path.join(projectDir, 'package-lock.json'))) {
      return 'npm';
    }
    return 'npm'; // Default to npm
  }

  /**
   * Determine if build is required
   */
  private static determineIfBuildRequired(
    typeResult: { type: ProjectType; hasBuildScript: boolean },
    buildResult: { exists: boolean; isComplete: boolean },
    forceBuild?: boolean
  ): boolean {
    // Force build if explicitly requested
    if (forceBuild) {
      return true;
    }

    // Static sites don't need build
    if (typeResult.type === 'static') {
      return false;
    }

    // If prebuilt, don't need to build
    if (buildResult.exists && buildResult.isComplete) {
      return false;
    }

    // React and Next.js always need build if no output exists
    if (typeResult.type === 'react' || typeResult.type === 'next') {
      return !buildResult.exists;
    }

    // Node.js needs build only if build script exists and no output
    if (typeResult.type === 'node') {
      return typeResult.hasBuildScript && !buildResult.exists;
    }

    return false;
  }

  /**
   * Determine deployment strategy
   */
  private static determineStrategy(
    type: ProjectType,
    isPrebuilt: boolean,
    isStatic: boolean,
    requiresBuild: boolean
  ): DeployAnalysis['strategy'] {
    if (isStatic || (type === 'react' && isPrebuilt)) {
      return 'static';
    }

    if (isPrebuilt && !requiresBuild) {
      return 'serve-prebuilt';
    }

    return 'build-and-serve';
  }

  /**
   * Determine how to serve the project
   */
  private static determineServeMethod(
    type: ProjectType,
    isStatic: boolean
  ): DeployAnalysis['serveMethod'] {
    if (isStatic || type === 'react' || type === 'static') {
      return 'caddy-static';
    }
    return 'pm2-proxy';
  }

  /**
   * Determine the directory to serve
   */
  private static determineServeDir(
    type: ProjectType,
    buildOutputDir: string | null,
    isNextStaticExport: boolean
  ): string | undefined {
    if (isNextStaticExport) {
      return 'out';
    }

    if (type === 'static') {
      return '.';
    }

    if (type === 'react' && buildOutputDir) {
      return buildOutputDir;
    }

    return undefined;
  }
}
