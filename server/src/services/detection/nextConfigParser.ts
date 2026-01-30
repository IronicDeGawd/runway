import fs from 'fs-extra';
import path from 'path';
import { logger } from '../../utils/logger';
import { NextConfig } from './types';

/**
 * Parses Next.js configuration files to extract deployment-relevant settings
 */
export class NextConfigParser {
  private static readonly CONFIG_FILES = [
    'next.config.js',
    'next.config.mjs',
    'next.config.ts',
  ];

  /**
   * Parse Next.js config from project directory
   */
  static async parse(projectDir: string): Promise<NextConfig | null> {
    for (const filename of this.CONFIG_FILES) {
      const configPath = path.join(projectDir, filename);
      if (await fs.pathExists(configPath)) {
        try {
          return await this.parseConfigFile(configPath, filename);
        } catch (error) {
          logger.warn(`Failed to parse ${filename}:`, error);
        }
      }
    }
    return null;
  }

  /**
   * Parse a specific config file
   */
  private static async parseConfigFile(
    configPath: string,
    filename: string
  ): Promise<NextConfig> {
    const content = await fs.readFile(configPath, 'utf-8');
    const config: NextConfig = {};

    // Extract output mode (static export detection)
    const outputMatch = content.match(/output\s*:\s*['"](\w+)['"]/);
    if (outputMatch) {
      config.output = outputMatch[1] as 'standalone' | 'export';
    }

    // Extract basePath
    const basePathMatch = content.match(/basePath\s*:\s*['"]([^'"]+)['"]/);
    if (basePathMatch) {
      config.basePath = basePathMatch[1];
    }

    // Extract distDir
    const distDirMatch = content.match(/distDir\s*:\s*['"]([^'"]+)['"]/);
    if (distDirMatch) {
      config.distDir = distDirMatch[1];
    }

    // Extract trailingSlash
    const trailingSlashMatch = content.match(/trailingSlash\s*:\s*(true|false)/);
    if (trailingSlashMatch) {
      config.trailingSlash = trailingSlashMatch[1] === 'true';
    }

    logger.debug(`Parsed ${filename}: output=${config.output}, basePath=${config.basePath}`);
    return config;
  }

  /**
   * Check if Next.js project is configured for static export
   */
  static async isStaticExport(projectDir: string): Promise<boolean> {
    // Check config for output: 'export'
    const config = await this.parse(projectDir);
    if (config?.output === 'export') {
      return true;
    }

    // Check for existing 'out' directory (already exported)
    const outDir = path.join(projectDir, 'out');
    if (await fs.pathExists(outDir)) {
      const files = await fs.readdir(outDir);
      if (files.includes('index.html') || files.length > 0) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get the output directory for Next.js build
   */
  static async getOutputDir(projectDir: string): Promise<string> {
    const config = await this.parse(projectDir);

    // Static export uses 'out' directory
    if (config?.output === 'export') {
      return 'out';
    }

    // Custom distDir or default '.next'
    return config?.distDir || '.next';
  }
}
