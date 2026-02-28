import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';

const PATCH_START = '// runway:basePath-start';
const PATCH_END = '// runway:basePath-end';
const CONFIG_FILES = ['next.config.ts', 'next.config.mjs', 'next.config.js'];

/**
 * Next.js config patcher for CLI builds.
 * Injects basePath and assetPrefix into next.config.{ts,mjs,js}
 * so the app works correctly under /app/<project-name>/ subpath.
 */
export class NextPatcher {
  /**
   * Inject basePath and assetPrefix before a local build.
   * Returns true if patching was applied.
   */
  static async patch(projectPath: string, projectName: string): Promise<boolean> {
    const safeName = projectName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const basePath = `/app/${safeName}`;

    const configFile = NextPatcher.findConfigFile(projectPath);
    if (!configFile) {
      logger.warn('No next.config found — basePath will not be set.');
      logger.warn('App may not work correctly under /app/ subpath.');
      return false;
    }

    const configPath = path.join(projectPath, configFile);
    let content = fs.readFileSync(configPath, 'utf-8');

    // Already patched (e.g. interrupted previous run)
    if (content.includes(PATCH_START)) {
      logger.dim('Next.js config already patched — skipping');
      return true;
    }

    // Check if user already has basePath set (anchored to line start to avoid matching comments)
    if (/^\s*basePath\s*:/m.test(content)) {
      logger.dim('User has basePath configured — skipping patcher');
      return false;
    }

    const patchLines = [
      PATCH_START,
      `  basePath: '${basePath}',`,
      `  assetPrefix: '${basePath}',`,
      PATCH_END,
    ].join('\n');

    const patched = NextPatcher.injectIntoConfig(content, patchLines);
    if (!patched) {
      logger.warn('Could not auto-inject basePath into next.config — unrecognized format.');
      logger.warn(`Manually add basePath: '${basePath}' to your next.config for correct routing.`);
      return false;
    }

    fs.writeFileSync(configPath, patched, 'utf-8');
    logger.success(`Patched ${configFile} with basePath: '${basePath}'`);
    return true;
  }

  /**
   * Revert the basePath patch after build.
   */
  static async revert(projectPath: string): Promise<void> {
    const configFile = NextPatcher.findConfigFile(projectPath);
    if (!configFile) return;

    const configPath = path.join(projectPath, configFile);
    let content = fs.readFileSync(configPath, 'utf-8');

    if (!content.includes(PATCH_START)) return;

    // Remove everything between PATCH_START and PATCH_END (inclusive)
    const startIdx = content.indexOf(PATCH_START);
    const endIdx = content.indexOf(PATCH_END);
    if (startIdx === -1 || endIdx === -1) return;

    const before = content.slice(0, startIdx);
    const after = content.slice(endIdx + PATCH_END.length);

    // Clean up: remove the \n injected before PATCH_START and \n after PATCH_END
    content = before.replace(/\n$/, '') + after.replace(/^\n/, '');

    fs.writeFileSync(configPath, content, 'utf-8');
    logger.dim('Reverted Next.js basePath patch');
  }

  /**
   * Find which next.config file exists in the project.
   */
  private static findConfigFile(projectPath: string): string | null {
    for (const file of CONFIG_FILES) {
      if (fs.existsSync(path.join(projectPath, file))) {
        return file;
      }
    }
    return null;
  }

  /**
   * Inject patch lines into the config object.
   * Handles multiple common formats:
   *   - module.exports = { ... }
   *   - export default { ... }
   *   - const nextConfig = { ... }; export default nextConfig
   *   - export default withPlugin({ ... })
   */
  private static injectIntoConfig(content: string, patchLines: string): string | null {
    // Strategy: find the first `{` that belongs to the config object and inject after it.
    // We try several patterns in order of specificity.

    const patterns = [
      // module.exports = { ...
      /module\.exports\s*=\s*\{/,
      // export default { ...
      /export\s+default\s+\{/,
      // const nextConfig: NextConfig = { ...  (TS — require Config-like type)
      /(?:const|let|var)\s+\w+\s*:\s*\w*[Cc]onfig\w*\s*=\s*\{/,
      // export default withPlugin({ ...  or defineConfig({ ...
      /export\s+default\s+\w+\(\s*\{/,
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match && match.index !== undefined) {
        return NextPatcher.insertAfterBrace(content, match, patchLines);
      }
    }

    // Fallback: detect `export default <varName>` and find matching `const <varName> = {`
    const reExport = content.match(/export\s+default\s+(\w+)\s*;/);
    if (reExport) {
      const varName = reExport[1];
      const varPattern = new RegExp(`(?:const|let|var)\\s+${varName}(?:\\s*:\\s*\\w+)?\\s*=\\s*\\{`);
      const varMatch = content.match(varPattern);
      if (varMatch && varMatch.index !== undefined) {
        return NextPatcher.insertAfterBrace(content, varMatch, patchLines);
      }
    }

    return null;
  }

  private static insertAfterBrace(content: string, match: RegExpMatchArray, patchLines: string): string | null {
    const matchEnd = match.index! + match[0].length;
    const braceIdx = content.lastIndexOf('{', matchEnd);
    if (braceIdx === -1) return null;

    const before = content.slice(0, braceIdx + 1);
    const after = content.slice(braceIdx + 1);
    return `${before}\n${patchLines}\n${after}`;
  }
}
