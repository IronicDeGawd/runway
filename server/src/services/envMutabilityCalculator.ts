import {
  ProjectType,
  UploadType,
  DeploymentSource,
  EnvMutabilityInfo,
  EnvImmutableReason,
} from '@runway/shared';

export interface MutabilityInput {
  projectType: ProjectType;
  uploadType: UploadType;
  deploymentSource: DeploymentSource;
  envInjected: boolean;
  hasSource: boolean;
}

/**
 * Calculates ENV mutability based on deployment characteristics
 *
 * Rules:
 * - Node.js: Always mutable (runtime ENV injection via PM2)
 * - Static sites: Always immutable (no runtime)
 * - React/Next full project with source: Mutable (can rebuild)
 * - React/Next dist-only: Immutable (no source to rebuild)
 * - CLI deploy without ENV injection: Immutable (ENV baked in at build time)
 */
export class EnvMutabilityCalculator {
  /**
   * Calculate ENV mutability based on deployment characteristics
   */
  static calculate(input: MutabilityInput): EnvMutabilityInfo {
    const { projectType, uploadType, deploymentSource, envInjected, hasSource } = input;

    // Static sites never have mutable ENV - they have no runtime
    if (projectType === 'static') {
      return {
        mutable: false,
        reason: 'static-site',
        message: 'Static sites do not support environment variables.',
      };
    }

    // Node.js always has mutable ENV (runtime injection via PM2 restart)
    if (projectType === 'node') {
      return { mutable: true };
    }

    // React/Next: dist-only deploys are immutable (no source to rebuild)
    if (uploadType === 'dist' || !hasSource) {
      return {
        mutable: false,
        reason: 'dist-only',
        message:
          'This project was deployed using build artifacts only. Environment variables cannot be modified. Re-deploy the project with updated values.',
      };
    }

    // CLI deploy with local build but without ENV injection
    // The ENV vars were not injected during build, so they're baked in empty
    if (deploymentSource === 'cli' && uploadType === 'build' && !envInjected) {
      return {
        mutable: false,
        reason: 'cli-no-injection',
        message:
          'This project was deployed via CLI without environment injection. Environment variables cannot be modified. Re-deploy the project to change ENV values.',
      };
    }

    // Default: mutable (full project with source, can rebuild)
    return { mutable: true };
  }

  /**
   * Get a user-friendly message explaining why ENV is immutable
   */
  static getImmutableMessage(reason: EnvImmutableReason): string {
    switch (reason) {
      case 'dist-only':
        return 'This project was deployed using build artifacts only. Environment variables cannot be modified. Re-deploy the project with updated values.';
      case 'cli-no-injection':
        return 'This project was deployed via CLI without environment injection. Environment variables cannot be modified. Re-deploy the project to change ENV values.';
      case 'static-site':
        return 'Static sites do not support environment variables.';
      default:
        return 'Environment variables cannot be modified for this project.';
    }
  }
}

export const envMutabilityCalculator = new EnvMutabilityCalculator();
