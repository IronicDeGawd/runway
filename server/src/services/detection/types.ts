import { ProjectType, PackageManager } from '@runway/shared';

/**
 * Result of generic build output detection
 * No framework-specific knowledge - just checks common build directories
 */
export interface BuildOutputResult {
  exists: boolean;
  directory: string | null;
  isComplete: boolean;
}

/**
 * Result of static site detection
 */
export interface StaticSiteResult {
  isStatic: boolean;
  entryFile: string | null;
  hasAssets: boolean;
  assetDirs: string[];
}

/**
 * Package.json structure (partial)
 */
export interface PackageJson {
  name?: string;
  version?: string;
  main?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/**
 * Full analysis result from DeployAnalyzer
 * Backend trusts user-declared type - no auto-detection
 */
export interface DeployAnalysis {
  // User's declared type (trusted, not validated)
  declaredType: ProjectType;

  // Package state
  hasPackageJson: boolean;
  packageManager: PackageManager;
  alternativePackageManagers?: PackageManager[];
  packageJson?: PackageJson;

  // Build state (generic detection)
  hasBuildOutput: boolean;
  buildOutputDir: string | null;
  requiresBuild: boolean;
  hasBuildScript: boolean;
  hasStartScript: boolean;

  // Prebuilt detection (generic)
  isPrebuiltProject: boolean;

  // Static site detection (generic)
  isStaticSite: boolean;

  // Deployment strategy
  strategy: 'static' | 'build-and-serve' | 'serve-prebuilt';
  serveMethod: 'caddy-static' | 'pm2-proxy';
  serveDir?: string;

  // Warnings for UI/CLI
  warnings: DeployWarning[];

  // Required confirmations
  requiresConfirmation: boolean;
  confirmationReason?: string;
}

/**
 * Warning generated during analysis
 */
export interface DeployWarning {
  level: 'info' | 'warning' | 'critical';
  message: string;
  code: WarningCode;
}

/**
 * Warning codes for categorization
 */
export type WarningCode =
  | 'SERVER_BUILD'
  | 'SKIP_BUILD'
  | 'MISSING_BUILD_SCRIPT'
  | 'MISSING_START_SCRIPT'
  | 'INCOMPLETE_BUILD'
  | 'LARGE_PROJECT';

/**
 * Options for analyze function
 */
export interface AnalyzeOptions {
  forceBuild?: boolean;
}
