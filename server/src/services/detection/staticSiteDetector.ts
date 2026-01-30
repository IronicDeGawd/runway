import fs from 'fs-extra';
import path from 'path';
import { logger } from '../../utils/logger';
import { StaticSiteResult } from './types';

/**
 * Detects static site deployments (HTML/CSS/JS without framework)
 */
export class StaticSiteDetector {
  private static readonly ENTRY_FILES = ['index.html', 'index.htm'];
  private static readonly ASSET_DIRS = ['css', 'js', 'assets', 'images', 'img', 'static', 'styles'];

  /**
   * Detect if directory contains a static site
   */
  static async detect(projectDir: string): Promise<StaticSiteResult> {
    const entryFile = await this.findEntryFile(projectDir);
    const assetDirs = await this.findAssetDirs(projectDir);

    const result: StaticSiteResult = {
      isStatic: entryFile !== null,
      entryFile,
      hasAssets: assetDirs.length > 0,
      assetDirs,
    };

    if (result.isStatic) {
      logger.debug(`Static site detected: entry=${entryFile}, assets=${assetDirs.join(', ')}`);
    }

    return result;
  }

  /**
   * Find the entry HTML file
   */
  static async findEntryFile(projectDir: string): Promise<string | null> {
    for (const filename of this.ENTRY_FILES) {
      const filePath = path.join(projectDir, filename);
      if (await fs.pathExists(filePath)) {
        return filename;
      }
    }
    return null;
  }

  /**
   * Find common asset directories
   */
  private static async findAssetDirs(projectDir: string): Promise<string[]> {
    const found: string[] = [];

    for (const dir of this.ASSET_DIRS) {
      const dirPath = path.join(projectDir, dir);
      try {
        const stat = await fs.stat(dirPath);
        if (stat.isDirectory()) {
          found.push(dir);
        }
      } catch {
        // Directory doesn't exist
      }
    }

    return found;
  }

  /**
   * Check if a directory looks like static build output
   * (has index.html and possibly asset files)
   */
  static async isBuildOutput(dir: string): Promise<boolean> {
    const hasIndex = await this.findEntryFile(dir) !== null;
    if (!hasIndex) return false;

    // Check for typical build output patterns
    const files = await fs.readdir(dir);
    const hasAssetFiles = files.some(f =>
      f.endsWith('.js') ||
      f.endsWith('.css') ||
      f === 'assets' ||
      f === 'static'
    );

    return hasIndex && (hasAssetFiles || files.length > 1);
  }
}
