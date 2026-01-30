import { ProjectType, PackageManager } from '@runway/shared';

/**
 * Result of project type detection
 */
export interface TypeDetectionResult {
  type: ProjectType;
  confidence: 'high' | 'medium' | 'low';
  indicators: string[];
  hasBuildScript: boolean;
  hasStartScript: boolean;
}

/**
 * Result of build output detection
 */
export interface BuildOutputResult {
  exists: boolean;
  directory: string | null;
  isComplete: boolean;
  outputType: 'react-vite' | 'react-cra' | 'next-server' | 'next-static' | 'node-compiled' | 'static' | null;
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
 * Parsed Next.js configuration
 */
export interface NextConfig {
  output?: 'standalone' | 'export';
  basePath?: string;
  distDir?: string;
  trailingSlash?: boolean;
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
 */
export interface DeployAnalysis {
  // Detection results
  detectedType: ProjectType;
  declaredType?: ProjectType;
  typeMatchesDeclared: boolean;

  // Package state
  hasPackageJson: boolean;
  packageManager: PackageManager;
  packageJson?: PackageJson;

  // Build state
  hasBuildOutput: boolean;
  buildOutputDir: string | null;
  buildOutputType: BuildOutputResult['outputType'];
  requiresBuild: boolean;
  hasBuildScript: boolean;

  // Special cases
  isStaticSite: boolean;
  isNextStaticExport: boolean;
  isPrebuiltProject: boolean;

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
  | 'TYPE_MISMATCH'
  | 'MISSING_ENTRY'
  | 'MISSING_BUILD_SCRIPT'
  | 'MISSING_START_SCRIPT'
  | 'INCOMPLETE_BUILD'
  | 'LARGE_PROJECT';

/**
 * Options for analyze function
 */
export interface AnalyzeOptions {
  declaredType?: ProjectType;
  forceBuild?: boolean;
}
