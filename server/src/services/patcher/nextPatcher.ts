import { ProjectType } from '@runway/shared';
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
    const nextConfigs = ['next.config.ts', 'next.config.mjs', 'next.config.js'];
      
    for (const configFile of nextConfigs) {
      const configPath = path.join(dir, configFile);
      if (await fs.pathExists(configPath)) {
        logger.info(`Configuring base path in ${configFile}`);
        let content = await fs.readFile(configPath, 'utf-8');
        
        // Skip if basePath already set (line-anchored to avoid matching comments)
        if (/^\s*basePath\s*:/m.test(content)) {
          logger.info(`basePath already configured in ${configFile} — skipping`);
          return;
        }

        const injection = `\n  basePath: '${basePath}',\n  assetPrefix: '${basePath}',`;

        // Try multiple config patterns in order of specificity
        const patterns: [RegExp, string][] = [
          [/(module\.exports\s*=\s*\{)/, `$1${injection}`],
          [/(export\s+default\s+\{)/, `$1${injection}`],
          // TS variable: const nextConfig: NextConfig = { ... (require Config-like type)
          [/((?:const|let|var)\s+\w+\s*:\s*\w*[Cc]onfig\w*\s*=\s*\{)/, `$1${injection}`],
          // Wrapped: export default withPlugin({ ...
          [/(export\s+default\s+\w+\(\s*\{)/, `$1${injection}`],
        ];

        let patched = false;
        for (const [pattern, replacement] of patterns) {
          if (pattern.test(content)) {
            content = content.replace(pattern, replacement);
            patched = true;
            break;
          }
        }

        // Fallback: detect `export default <varName>` and find matching variable declaration
        if (!patched) {
          const reExport = content.match(/export\s+default\s+(\w+)\s*;/);
          if (reExport) {
            const varName = reExport[1];
            const varPattern = new RegExp(`((?:const|let|var)\\s+${varName}(?:\\s*:\\s*\\w+)?\\s*=\\s*\\{)`);
            if (varPattern.test(content)) {
              content = content.replace(varPattern, `$1${injection}`);
              patched = true;
            }
          }
        }

        if (!patched) {
          logger.warn(`Could not inject basePath into ${configFile} — unrecognized format`);
          return;
        }
        
        await fs.writeFile(configPath, content, 'utf-8');
        logger.info(`✅ Base path and asset prefix set to ${basePath} in ${configFile}`);
        return;
      }
    }
    
    logger.warn('No next.config found, assets may not load correctly in subdirectory');
  }
}
