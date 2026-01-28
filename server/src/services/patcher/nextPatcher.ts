import { ProjectType } from '@pdcp/shared';
import fs from 'fs-extra';
import path from 'path';
import { PatcherStrategy, PatcherContext } from './types';
import { logger } from '../../utils/logger';

export class NextPatcher implements PatcherStrategy {
  
  async canApply(dir: string, projectType: ProjectType): Promise<boolean> {
    return projectType === 'next';
  }

  async apply(dir: string, context: PatcherContext): Promise<void> {
    await this.configureBasePath(dir, context.projectName);
  }

  /**
   * Configure base path for Next.js projects to work in subdirectories
   */
  private async configureBasePath(dir: string, projectName: string): Promise<void> {
    const basePath = `/app/${projectName}`;
    const nextConfigs = ['next.config.js', 'next.config.mjs'];
      
    for (const configFile of nextConfigs) {
      const configPath = path.join(dir, configFile);
      if (await fs.pathExists(configPath)) {
        logger.info(`Configuring base path in ${configFile}`);
        let content = await fs.readFile(configPath, 'utf-8');
        
        // Add basePath and assetPrefix to Next.js config
        if (content.includes('module.exports')) {
          // CommonJS format
          content = content.replace(
            /(module\.exports\s*=\s*{)/,
            `$1\n  basePath: '${basePath}',\n  assetPrefix: '${basePath}',`
          );
        } else if (content.includes('export default')) {
          // ES module format
          content = content.replace(
            /(export\s+default\s+{)/,
            `$1\n  basePath: '${basePath}',\n  assetPrefix: '${basePath}',`
          );
        }
        
        await fs.writeFile(configPath, content, 'utf-8');
        logger.info(`✅ Base path and asset prefix set to ${basePath} in ${configFile}`);
        return;
      }
    }
    
    logger.warn('No next.config found, assets may not load correctly in subdirectory');
  }
}
