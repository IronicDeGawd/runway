import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import { ProjectType } from '../types';
import { logger } from '../utils/logger';

export interface PackageOptions {
  projectPath: string;
  projectType: ProjectType;
  buildOutputDir: string;
  includeSource: boolean; // For server-build mode
  envFile?: string; // Path to env file to include (for Node.js projects)
}

export interface PackageResult {
  zipPath: string;
  size: number;
}

export class PackageService {
  async package(options: PackageOptions): Promise<PackageResult> {
    const { projectPath, projectType, buildOutputDir, includeSource } = options;

    const zipPath = path.join(projectPath, '.runway-deploy.zip');

    // Remove existing zip if present
    if (fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
    }

    logger.info('Creating deployment package...');

    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', {
      zlib: { level: 9 }, // Maximum compression
    });

    return new Promise((resolve, reject) => {
      output.on('close', () => {
        const size = archive.pointer();
        logger.success(`Package created: ${(size / 1024 / 1024).toFixed(2)} MB`);
        resolve({ zipPath, size });
      });

      archive.on('error', (err) => {
        reject(err);
      });

      archive.pipe(output);

      // Include CLI metadata in the package
      this.addRunwayMetadata(archive, includeSource ? 'server' : 'local', projectType);

      if (includeSource) {
        // Server-build mode: include source files
        this.addSourceFiles(archive, projectPath);
      } else {
        // Local-build mode: include only build artifacts
        this.addBuildArtifacts(archive, projectPath, projectType, buildOutputDir, options.envFile);
      }

      archive.finalize();
    });
  }

  private addSourceFiles(archive: archiver.Archiver, projectPath: string): void {
    // Include all files except node_modules, .git, and build outputs
    const ignorePatterns = [
      'node_modules/**',
      '.git/**',
      '.next/**',
      'dist/**',
      'build/**',
      '.runway-deploy.zip',
      '*.log',
      '.env.local',
      '.env.*.local',
    ];

    archive.glob('**/*', {
      cwd: projectPath,
      ignore: ignorePatterns,
      dot: true, // Include dotfiles
    });

    logger.dim('Including source files for server-side build');
  }

  private addBuildArtifacts(
    archive: archiver.Archiver,
    projectPath: string,
    projectType: ProjectType,
    buildOutputDir: string,
    envFile?: string
  ): void {
    // Include package.json if it exists (optional for static sites)
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      archive.file(packageJsonPath, { name: 'package.json' });
    }

    switch (projectType) {
      case 'react':
        // Include built static files
        this.addDirectory(archive, buildOutputDir, 'dist');
        logger.dim(`Including build output from ${buildOutputDir}`);
        break;

      case 'next':
        // Include .next directory but exclude cache (can be 200+ MB of build cache)
        this.addDirectoryFiltered(
          archive,
          path.join(projectPath, '.next'),
          '.next',
          ['cache/**']
        );

        // Include public directory if exists
        const publicDir = path.join(projectPath, 'public');
        if (fs.existsSync(publicDir)) {
          this.addDirectory(archive, publicDir, 'public');
        }

        // Include next.config.js if exists
        for (const configFile of ['next.config.js', 'next.config.mjs', 'next.config.ts']) {
          const configPath = path.join(projectPath, configFile);
          if (fs.existsSync(configPath)) {
            archive.file(configPath, { name: configFile });
          }
        }

        // Include package-lock.json or yarn.lock for production dependencies
        this.addLockFile(archive, projectPath);

        logger.dim('Including Next.js build artifacts');
        break;

      case 'node':
        // For Node.js, include everything except node_modules and env files
        const nodeIgnorePatterns = [
          'node_modules/**',
          '.git/**',
          '.runway-deploy.zip',
          '*.log',
          '.env',      // Exclude default .env (we'll add specified one explicitly)
          '.env.*',
        ];

        archive.glob('**/*', {
          cwd: projectPath,
          ignore: nodeIgnorePatterns,
          dot: true,
        });

        // Include the specified env file as .env
        if (envFile && fs.existsSync(envFile)) {
          archive.file(envFile, { name: '.env' });
          logger.dim('Including environment file');
        }

        logger.dim('Including Node.js project files');
        break;

      case 'static':
        // For static sites, include HTML, CSS, JS, and common assets
        const staticIgnorePatterns = [
          'node_modules/**',
          '.git/**',
          '.runway-deploy.zip',
          '*.log',
          '.env',
          '.env.*',
        ];

        archive.glob('**/*', {
          cwd: projectPath,
          ignore: staticIgnorePatterns,
          dot: false, // Don't include dotfiles for static sites
        });

        logger.dim('Including static site files');
        break;
    }
  }

  private addRunwayMetadata(
    archive: archiver.Archiver,
    buildMode: 'local' | 'server',
    projectType: ProjectType
  ): void {
    try {
      const cliPkg = JSON.parse(
        fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf-8')
      );
      const metadata = {
        cliVersion: cliPkg.version,
        buildMode,
        projectType,
        packagedAt: new Date().toISOString(),
      };
      archive.append(Buffer.from(JSON.stringify(metadata, null, 2) + '\n'), {
        name: '.runway-metadata.json',
      });
    } catch {
      // Non-critical — skip silently
    }
  }

  private addDirectory(archive: archiver.Archiver, dirPath: string, destPath: string): void {
    if (fs.existsSync(dirPath)) {
      archive.directory(dirPath, destPath);
    }
  }

  private addDirectoryFiltered(
    archive: archiver.Archiver,
    dirPath: string,
    destPath: string,
    ignore: string[]
  ): void {
    if (fs.existsSync(dirPath)) {
      archive.glob('**/*', {
        cwd: dirPath,
        ignore,
        dot: true,
      }, { prefix: destPath });
    }
  }

  private addLockFile(archive: archiver.Archiver, projectPath: string): void {
    const lockFiles = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];

    for (const lockFile of lockFiles) {
      const lockPath = path.join(projectPath, lockFile);
      if (fs.existsSync(lockPath)) {
        archive.file(lockPath, { name: lockFile });
        break;
      }
    }
  }

  cleanup(zipPath: string): void {
    if (fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
    }
  }
}

export const packageService = new PackageService();
