import fs from 'fs';
import path from 'path';
import { ProjectType, PackageManager } from '../types';

export interface DetectedProject {
  type: ProjectType;
  name: string;
  version: string;
  packageManager: PackageManager;
  buildScript: string | null;
  startScript: string | null;
  buildOutputDir: string;
}

interface PackageJson {
  name?: string;
  version?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export class ProjectDetector {
  private projectPath: string;

  constructor(projectPath: string = process.cwd()) {
    this.projectPath = projectPath;
  }

  async detect(): Promise<DetectedProject> {
    // Check for static site first (index.html without package.json or with minimal package.json)
    const hasIndexHtml = fs.existsSync(path.join(this.projectPath, 'index.html'));
    const hasPackageJson = fs.existsSync(path.join(this.projectPath, 'package.json'));

    // Static site: has index.html but no package.json
    if (hasIndexHtml && !hasPackageJson) {
      return {
        type: 'static',
        name: path.basename(this.projectPath),
        version: '1.0.0',
        packageManager: 'none',
        buildScript: null,
        startScript: null,
        buildOutputDir: '.',
      };
    }

    // If no package.json and no index.html, unsupported
    if (!hasPackageJson && !hasIndexHtml) {
      throw new Error(
        `No package.json or index.html found in ${this.projectPath}\n\n` +
        `Runway CLI supports:\n` +
        `  - Static sites (with index.html)\n` +
        `  - React/Next.js/Node.js projects (with package.json)\n\n` +
        `Python, Ruby, Go, and other runtimes are not supported.`
      );
    }

    const packageJson = this.readPackageJson();
    const type = this.detectProjectType(packageJson, hasIndexHtml);
    const packageManager = this.detectPackageManager();
    const buildOutputDir = this.getBuildOutputDir(type);

    return {
      type,
      name: packageJson.name || path.basename(this.projectPath),
      version: packageJson.version || '0.0.1',
      packageManager,
      buildScript: packageJson.scripts?.build || null,
      startScript: packageJson.scripts?.start || null,
      buildOutputDir,
    };
  }

  private readPackageJson(): PackageJson {
    const packageJsonPath = path.join(this.projectPath, 'package.json');

    try {
      const content = fs.readFileSync(packageJsonPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to parse package.json: ${error}`);
    }
  }

  private detectProjectType(packageJson: PackageJson, hasIndexHtml: boolean): ProjectType {
    const deps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    // Check for Next.js
    if (deps['next']) {
      return 'next';
    }

    // Check for React (and not Next.js)
    if (deps['react'] || deps['react-dom']) {
      const hasVite = deps['vite'] !== undefined;
      const hasCRA = deps['react-scripts'] !== undefined;

      if (hasVite || hasCRA || packageJson.scripts?.build) {
        return 'react';
      }
    }

    // Check for Node.js indicators
    const hasStartScript = packageJson.scripts?.start !== undefined;
    const hasMainEntry = fs.existsSync(path.join(this.projectPath, 'index.js')) ||
                         fs.existsSync(path.join(this.projectPath, 'src/index.js')) ||
                         fs.existsSync(path.join(this.projectPath, 'src/index.ts')) ||
                         fs.existsSync(path.join(this.projectPath, 'server.js')) ||
                         fs.existsSync(path.join(this.projectPath, 'app.js'));

    if (hasStartScript || hasMainEntry) {
      return 'node';
    }

    // If has index.html with package.json but no framework detected, treat as static
    if (hasIndexHtml) {
      return 'static';
    }

    // If has a build script, assume it's a frontend project that compiles to static
    if (packageJson.scripts?.build) {
      return 'static';
    }

    throw new Error(
      `Could not detect a supported project type.\n\n` +
      `Runway supports: React, Next.js, Node.js, and Static HTML.\n\n` +
      `For Node.js apps, add a "start" script to package.json.\n` +
      `For static sites, ensure index.html exists at the project root.`
    );
  }

  private detectPackageManager(): PackageManager {
    if (fs.existsSync(path.join(this.projectPath, 'pnpm-lock.yaml'))) {
      return 'pnpm';
    }

    if (fs.existsSync(path.join(this.projectPath, 'yarn.lock'))) {
      return 'yarn';
    }

    if (fs.existsSync(path.join(this.projectPath, 'package-lock.json'))) {
      return 'npm';
    }

    // No lock file found
    return 'npm';
  }

  private getBuildOutputDir(type: ProjectType): string {
    switch (type) {
      case 'react':
        if (fs.existsSync(path.join(this.projectPath, 'vite.config.ts')) ||
            fs.existsSync(path.join(this.projectPath, 'vite.config.js'))) {
          return 'dist';
        }
        return 'build';

      case 'next':
        return '.next';

      case 'node':
        return '.';

      case 'static':
        return '.';
    }
  }

  validateBuildOutput(): boolean {
    const hasPackageJson = fs.existsSync(path.join(this.projectPath, 'package.json'));
    const hasIndexHtml = fs.existsSync(path.join(this.projectPath, 'index.html'));

    // For static without package.json
    if (!hasPackageJson) {
      return hasIndexHtml;
    }

    const packageJson = this.readPackageJson();
    const type = this.detectProjectType(packageJson, hasIndexHtml);
    const outputDir = this.getBuildOutputDir(type);
    const outputPath = path.join(this.projectPath, outputDir);

    if (type === 'node') {
      return fs.existsSync(path.join(this.projectPath, 'package.json'));
    }

    if (type === 'static') {
      return fs.existsSync(path.join(this.projectPath, 'index.html'));
    }

    if (!fs.existsSync(outputPath)) {
      return false;
    }

    if (type === 'react') {
      return fs.existsSync(path.join(outputPath, 'index.html'));
    }

    if (type === 'next') {
      return fs.existsSync(path.join(outputPath, 'server'));
    }

    return false;
  }
}

export const detectProject = async (projectPath?: string): Promise<DetectedProject> => {
  const detector = new ProjectDetector(projectPath);
  return detector.detect();
};
