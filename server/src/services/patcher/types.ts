import { ProjectType } from '@pdcp/shared';

export interface PatcherContext {
  projectId: string;
  projectName: string;
  deploymentId: string;
}

export interface PatcherStrategy {
  /**
   * Check if this patcher applies to the project
   */
  canApply(dir: string, projectType: ProjectType): Promise<boolean>;

  /**
   * Apply patches to the project source code
   */
  apply(dir: string, context: PatcherContext): Promise<void>;
}
