import { ProjectType } from '@pdcp/shared';
import fs from 'fs-extra';
import path from 'path';
import { PatcherStrategy, PatcherContext } from './types';
import { logger } from '../../utils/logger';

export class ReactPatcher implements PatcherStrategy {
  
  async canApply(dir: string, projectType: ProjectType): Promise<boolean> {
    if (projectType === 'react') return true;
    
    // Fallback: check dependencies
    const pkgJsonPath = path.join(dir, 'package.json');
    if (await fs.pathExists(pkgJsonPath)) {
      const pkgJson = await fs.readJson(pkgJsonPath);
      const deps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };
      return !!deps['react'];
    }
    
    return false;
  }

  async apply(dir: string, context: PatcherContext): Promise<void> {
    await this.configureRouter(dir);
    // Future: we could move the vite.config.ts logic here if we decide to go back to file patching
  }

  /**
   * Configure React Router basename automatically
   */
  private async configureRouter(dir: string): Promise<void> {
    try {
      const pkgJsonPath = path.join(dir, 'package.json');
      if (!await fs.pathExists(pkgJsonPath)) return;
      
      const pkgJson = await fs.readJson(pkgJsonPath);
      const deps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };
      
      if (!deps['react-router-dom']) return;

      logger.info('Checking React Router configuration...');
      
      // Recursive function to find file with BrowserRouter
      const findRouterFile = async (currentDir: string): Promise<string | null> => {
        const entries = await fs.readdir(currentDir);
        
        for (const entry of entries) {
           const fullPath = path.join(currentDir, entry);
           const stat = await fs.stat(fullPath);
           
           if (stat.isDirectory()) {
             // Skip hidden folders, node_modules, dist, build, vendor, public
             if (entry.startsWith('.') || entry === 'node_modules' || entry === 'dist' || entry === 'build' || entry === 'vendor' || entry === 'public') continue;
             const found = await findRouterFile(fullPath);
             if (found) return found;
           } else if (/^(main|index|layout|home|App)\.(tsx|jsx|js)$/i.test(entry)) {
             const content = await fs.readFile(fullPath, 'utf-8');
             // Strict check: must import react-router-dom AND use <BrowserRouter
             if (content.includes('react-router-dom') && content.includes('<BrowserRouter')) {
               return fullPath;
             }
           }
        }
        return null;
      };
      
      const srcDir = path.join(dir, 'src');
      const routerFile = await fs.pathExists(srcDir) ? await findRouterFile(srcDir) : await findRouterFile(dir);
      
      if (routerFile) {
        let content = await fs.readFile(routerFile, 'utf-8');
        
        // precise regex to find <BrowserRouter> that DOES NOT already have basename
        // Match <BrowserRouter (whitespace) (not basename) ... >
        const tagRegex = /<BrowserRouter(?![^>]*basename=)(\s|>)/;
        
        if (tagRegex.test(content)) {
           // Inject basename
           // We use import.meta.env.BASE_URL which works with the --base build arg we added
           content = content.replace(
             /<BrowserRouter(\s|>)/, 
             '<BrowserRouter basename={import.meta.env.BASE_URL}$1'
           );
           await fs.writeFile(routerFile, content, 'utf-8');
           logger.info(`✅ Automatically configured React Router basename in ${path.basename(routerFile)}`);
        } else {
           logger.info('React Router already appears to be configured (basename prop found)');
        }
      } else {
        // Fallback warning
        logger.warn('⚠️ React Router detected but <BrowserRouter> usage not found for auto-patching.');
        logger.warn('PLEASE ACTION: Ensure you add `basename={import.meta.env.BASE_URL}` to your Router component manually to prevent 404 errors.');
      }
      
    } catch (error) {
      logger.warn('Failed to configure React Router:', error);
    }
  }
}
