import { ProjectType } from '@pdcp/shared';
import { PatcherStrategy, PatcherContext } from './types';
import { ReactPatcher } from './reactPatcher';
import { NextPatcher } from './nextPatcher';
import { logger } from '../../utils/logger';

export class PatcherService {
  private strategies: PatcherStrategy[] = [];

  constructor() {
    this.strategies = [
      new ReactPatcher(),
      new NextPatcher()
    ];
  }

  async patchProject(dir: string, type: ProjectType, context: PatcherContext): Promise<void> {
    logger.info(`Running patchers for ${context.projectName} (${type})...`);
    
    for (const strategy of this.strategies) {
      try {
        if (await strategy.canApply(dir, type)) {
          await strategy.apply(dir, context);
        }
      } catch (error) {
        logger.warn(`Patcher failed for ${context.projectName}:`, error);
        // We continue executing other patchers even if one fails
      }
    }
  }
}

export const patcherService = new PatcherService();
