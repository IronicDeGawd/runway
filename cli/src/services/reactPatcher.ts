import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';

/**
 * React Router patcher for CLI builds.
 * Injects `basename={import.meta.env.BASE_URL}` into <BrowserRouter>
 * so client-side routing works under /app/<project-name>/ subpath.
 * 
 * This is a port of the server's reactPatcher.ts adapted for CLI usage.
 */
export class ReactPatcher {
  /**
   * Check if React Router patching is needed and apply it.
   * Returns true if any patching was done.
   */
  static async patch(projectPath: string): Promise<boolean> {
    const pkgPath = path.join(projectPath, 'package.json');
    if (!fs.existsSync(pkgPath)) return false;

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    // Only patch if react-router-dom is a dependency
    if (!deps['react-router-dom']) return false;

    logger.info('React Router detected — checking for BrowserRouter...');

    const srcDir = path.join(projectPath, 'src');
    const searchDir = fs.existsSync(srcDir) ? srcDir : projectPath;
    const routerFile = ReactPatcher.findRouterFile(searchDir);

    if (!routerFile) {
      logger.warn('⚠️  React Router detected but <BrowserRouter> usage not found.');
      logger.warn('   Ensure you add `basename={import.meta.env.BASE_URL}` to your Router manually.');
      return false;
    }

    let content = fs.readFileSync(routerFile, 'utf-8');

    // Match <BrowserRouter> that does NOT already have basename
    const tagRegex = /<BrowserRouter(?![^>]*basename=)(\s|>)/;

    if (!tagRegex.test(content)) {
      logger.info('React Router already configured (basename prop found)');
      return false;
    }

    // Inject basename
    content = content.replace(
      /<BrowserRouter(\s|>)/,
      '<BrowserRouter basename={import.meta.env.BASE_URL}$1'
    );
    fs.writeFileSync(routerFile, content, 'utf-8');
    logger.success(`Patched React Router basename in ${path.basename(routerFile)}`);
    return true;
  }

  /**
   * Revert the basename patch (restore original state after build).
   */
  static async revert(projectPath: string): Promise<void> {
    const pkgPath = path.join(projectPath, 'package.json');
    if (!fs.existsSync(pkgPath)) return;

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (!deps['react-router-dom']) return;

    const srcDir = path.join(projectPath, 'src');
    const searchDir = fs.existsSync(srcDir) ? srcDir : projectPath;
    const routerFile = ReactPatcher.findRouterFile(searchDir);

    if (!routerFile) return;

    let content = fs.readFileSync(routerFile, 'utf-8');

    // Remove the injected basename prop
    const injectedPattern = /<BrowserRouter basename=\{import\.meta\.env\.BASE_URL\}(\s|>)/;
    if (injectedPattern.test(content)) {
      content = content.replace(injectedPattern, '<BrowserRouter$1');
      fs.writeFileSync(routerFile, content, 'utf-8');
      logger.dim('Reverted React Router basename patch');
    }
  }

  /**
   * Recursively find the file containing <BrowserRouter> usage.
   */
  private static findRouterFile(dir: string): string | null {
    try {
      const entries = fs.readdirSync(dir);

      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          // Skip non-source directories
          if (entry.startsWith('.') || entry === 'node_modules' || entry === 'dist' ||
              entry === 'build' || entry === 'vendor' || entry === 'public') continue;
          const found = ReactPatcher.findRouterFile(fullPath);
          if (found) return found;
        } else if (/^(main|index|layout|home|App)\.(tsx|jsx|js)$/i.test(entry)) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          if (content.includes('react-router-dom') && content.includes('<BrowserRouter')) {
            return fullPath;
          }
        }
      }
    } catch {
      // Ignore read errors
    }
    return null;
  }
}
