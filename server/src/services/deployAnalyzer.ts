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
import { BuildOutputDetector } from './detection/buildOutputDetector';
import { StaticSiteDetector } from './detection/staticSiteDetector';
import { BuildDetector } from './buildDetector';

/**
 * Orchestrates package analysis for deployment decisions
 *
 * Per Analysis Responsibility Guidelines:
 * - TRUSTS user-declared project type completely
 * - Does NOT auto-detect or validate framework types
 * - Only performs generic build vs source detection
 * - Adding new frameworks requires ZERO changes here
 */
export class DeployAnalyzer {
  /**
   * Analyze an extracted package to determine deployment strategy
   *
   * @param extractedPath - Path to extracted project
   * @param declaredType - User-declared project type (REQUIRED, trusted)
   * @param options - Additional options
   */
  static async analyze(
    extractedPath: string,
    declaredType: ProjectType,
    options: AnalyzeOptions = {}
  ): Promise<DeployAnalysis> {
    logger.info(`Analyzing package at: ${extractedPath} (declared type: ${declaredType})`);

    const warnings: DeployWarning[] = [];

    // Check for package.json
    const hasPackageJson = await fs.pathExists(
      path.join(extractedPath, 'package.json')
    );

    // Read package.json if exists
    let packageJson: PackageJson | undefined;
    let hasBuildScript = false;
    let hasStartScript = false;

    if (hasPackageJson) {
      packageJson = await this.readPackageJson(extractedPath);
      hasBuildScript = !!packageJson?.scripts?.build;
      hasStartScript = !!packageJson?.scripts?.start;
    }

    // Detect package manager(s)
    let packageManager = await this.detectPackageManager(extractedPath, hasPackageJson);
    let alternativePackageManagers: string[] = [];
    if (hasPackageJson) {
      const pmResult = await BuildDetector.detectAllPackageManagers(extractedPath);
      packageManager = pmResult.detected;
      alternativePackageManagers = pmResult.alternatives;
    }

    // Generic build output detection (no framework knowledge)
    const buildResult = await BuildOutputDetector.detect(extractedPath);

    // Determine if prebuilt (generic: has build output + appears complete)
    const isPrebuiltProject = buildResult.exists && buildResult.isComplete;

    // Check for static site in root (generic)
    const staticResult = await StaticSiteDetector.detect(extractedPath);
    const isStaticSite = declaredType === 'static' || (
      staticResult.isStatic && !hasPackageJson
    );

    // Determine if build is required
    const requiresBuild = this.determineIfBuildRequired(
      declaredType,
      isPrebuiltProject,
      hasBuildScript,
      options.forceBuild
    );

    // Determine deployment strategy based on user-declared type
    const strategy = this.determineStrategy(
      declaredType,
      isPrebuiltProject,
      isStaticSite,
      requiresBuild
    );

    // Determine serve method based on user-declared type
    const serveMethod = this.determineServeMethod(declaredType, isStaticSite);

    // Determine serve directory
    const serveDir = this.determineServeDir(
      declaredType,
      buildResult.directory,
      isStaticSite
    );

    // Generate warnings (generic, no type validation)
    this.addWarnings(
      warnings,
      declaredType,
      requiresBuild,
      isPrebuiltProject,
      hasBuildScript,
      hasStartScript,
      buildResult,
      options.forceBuild
    );

    // Check if server-side build is required (needs confirmation)
    const requiresServerBuild = requiresBuild && !isPrebuiltProject;

    const analysis: DeployAnalysis = {
      // User's declared type (trusted)
      declaredType,

      // Package state
      hasPackageJson,
      packageManager,
      alternativePackageManagers: alternativePackageManagers.length > 0 ? alternativePackageManagers as any : undefined,
      packageJson,

      // Build state
      hasBuildOutput: buildResult.exists,
      buildOutputDir: buildResult.directory,
      requiresBuild,
      hasBuildScript,
      hasStartScript,

      // Prebuilt detection
      isPrebuiltProject,

      // Static site
      isStaticSite,

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
      `Analysis complete: declaredType=${analysis.declaredType}, strategy=${analysis.strategy}, ` +
        `requiresBuild=${analysis.requiresBuild}, warnings=${warnings.length}`
    );

    return analysis;
  }

  /**
   * Read and parse package.json
   */
  static async readPackageJson(projectDir: string): Promise<PackageJson | undefined> {
    try {
      const pkgPath = path.join(projectDir, 'package.json');
      if (await fs.pathExists(pkgPath)) {
        return await fs.readJson(pkgPath);
      }
    } catch (error) {
      logger.warn('Failed to read package.json', { error });
    }
    return undefined;
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
   * Determine if build is required based on user-declared type
   */
  private static determineIfBuildRequired(
    declaredType: ProjectType,
    isPrebuilt: boolean,
    hasBuildScript: boolean,
    forceBuild?: boolean
  ): boolean {
    // Force build if explicitly requested
    if (forceBuild) {
      return true;
    }

    // Static sites don't need build
    if (declaredType === 'static') {
      return false;
    }

    // If prebuilt, don't need to build
    if (isPrebuilt) {
      return false;
    }

    // React and Next.js typically need build if no output exists
    if (declaredType === 'react' || declaredType === 'next') {
      return true;
    }

    // Node.js needs build only if build script exists
    if (declaredType === 'node') {
      return hasBuildScript;
    }

    return false;
  }

  /**
   * Determine deployment strategy based on user-declared type
   */
  private static determineStrategy(
    declaredType: ProjectType,
    isPrebuilt: boolean,
    isStatic: boolean,
    requiresBuild: boolean
  ): DeployAnalysis['strategy'] {
    // Static sites or prebuilt React apps serve as static
    if (isStatic || (declaredType === 'react' && isPrebuilt)) {
      return 'static';
    }

    // Prebuilt but not static - serve without rebuilding
    if (isPrebuilt && !requiresBuild) {
      return 'serve-prebuilt';
    }

    return 'build-and-serve';
  }

  /**
   * Determine how to serve the project based on user-declared type
   */
  private static determineServeMethod(
    declaredType: ProjectType,
    isStatic: boolean
  ): DeployAnalysis['serveMethod'] {
    // Static sites and React use Caddy
    if (isStatic || declaredType === 'react' || declaredType === 'static') {
      return 'caddy-static';
    }
    // Node and Next use PM2 proxy
    return 'pm2-proxy';
  }

  /**
   * Determine the directory to serve
   */
  private static determineServeDir(
    declaredType: ProjectType,
    buildOutputDir: string | null,
    isStatic: boolean
  ): string | undefined {
    if (declaredType === 'static' || isStatic) {
      return buildOutputDir || '.';
    }

    if (declaredType === 'react' && buildOutputDir) {
      return buildOutputDir;
    }

    // Next.js static export typically uses 'out'
    if (declaredType === 'next' && buildOutputDir === 'out') {
      return 'out';
    }

    return undefined;
  }

  /**
   * Add warnings based on analysis (generic, no type validation)
   */
  private static addWarnings(
    warnings: DeployWarning[],
    declaredType: ProjectType,
    requiresBuild: boolean,
    isPrebuilt: boolean,
    hasBuildScript: boolean,
    hasStartScript: boolean,
    buildResult: { exists: boolean; isComplete: boolean; directory: string | null },
    forceBuild?: boolean
  ): void {
    // Server-side build warning (React/Next not prebuilt)
    if (requiresBuild && !isPrebuilt && (declaredType === 'react' || declaredType === 'next')) {
      warnings.push({
        level: 'warning',
        message: 'Server-side build will consume significant resources on small instances',
        code: 'SERVER_BUILD',
      });
    }

    // Skip build info (existing output found)
    if (buildResult.exists && !forceBuild && !requiresBuild) {
      warnings.push({
        level: 'info',
        message: `Existing build output found in ${buildResult.directory}/, will skip rebuild`,
        code: 'SKIP_BUILD',
      });
    }

    // Missing build script warning
    if (requiresBuild && !hasBuildScript) {
      warnings.push({
        level: 'critical',
        message: 'Build is required but no "build" script found in package.json - deployment may fail',
        code: 'MISSING_BUILD_SCRIPT',
      });
    }

    // Missing start script warning (for Node/Next)
    if ((declaredType === 'node' || declaredType === 'next') && !hasStartScript) {
      warnings.push({
        level: 'critical',
        message: 'No "start" script found in package.json - server may not start',
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
  }
}
