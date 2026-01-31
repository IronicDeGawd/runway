import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import yauzl from 'yauzl';
import { Transform } from 'stream';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';

export interface ZipExtractionResult {
  extractionPath: string;
  fileCount: number;
}

const validateEntry = (fileName: string): void => {
  if (fileName.includes('..')) {
    throw new AppError(`Security: Path traversal detected in ${fileName}`, 400);
  }
  if (path.isAbsolute(fileName)) {
    throw new AppError(`Security: Absolute path detected in ${fileName}`, 400);
  }
};

export const extractZip = (zipFilePath: string, destDir: string): Promise<ZipExtractionResult> => {
  return new Promise((resolve, reject) => {
    yauzl.open(zipFilePath, { lazyEntries: true }, (err: any, zipfile: any) => {
      if (err) return reject(err);
      if (!zipfile) return reject(new AppError('Failed to open zip file', 500));

      let fileCount = 0;

      // Create destination directory
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      zipfile.readEntry();

      zipfile.on('entry', (entry: any) => {
        try {
          validateEntry(entry.fileName);

          // Skip directories (they are created implicitly by mkdirs for files, usually)
          // But strict implementations might check directory entries too.
          // Yauzl directories end with /.
          if (/\/$/.test(entry.fileName)) {
            // It's a directory
            zipfile.readEntry();
            return;
          }
          
          // Reject symlinks
          // In yauzl, externalFileAttributes >> 16 & 0o170000 === 0o120000
          // But entry.isEncrypted is explicitly checked by yauzl usually
          // For symlinks, we need to check attributes. But yauzl doesn't expose strict getters for symlink
          // We can check if it relies on MS-DOS or Unix attributes.
          // Standard check:
          const isSymlink = (entry.externalFileAttributes >> 16 & 0o120000) === 0o120000;
          if (isSymlink) {
             logger.warn(`Security: Skipped symlink ${entry.fileName}`);
             zipfile.readEntry();
             return;
          }

          const fullDest = path.join(destDir, entry.fileName);
          const parentDir = path.dirname(fullDest);

          if (!fs.existsSync(parentDir)) {
            fs.mkdirSync(parentDir, { recursive: true });
          }

          zipfile.openReadStream(entry, (err: any, readStream: any) => {
            if (err) return reject(err);
            if (!readStream) return reject(new Error('Failed to create read stream'));

            const writeStream = fs.createWriteStream(fullDest);
            
            readStream.pipe(writeStream);

            writeStream.on('finish', () => {
              fileCount++;
              zipfile.readEntry();
            });

            writeStream.on('error', (ioErr) => {
              reject(ioErr);
            });
          });

        } catch (validationErr) {
          zipfile.close();
          reject(validationErr);
        }
      });

      zipfile.on('end', () => {
        resolve({ extractionPath: destDir, fileCount });
      });

      zipfile.on('error', (zipErr: any) => {
        reject(zipErr);
      });
    });
  });
};

/**
 * Find the project root inside an extracted directory
 * Handles cases where zip contains a single nested folder (e.g., zip -r project.zip my-app/)
 */
export async function findProjectRoot(extractedPath: string): Promise<string> {
  // Check if package.json or index.html exists at root
  const packageJsonPath = path.join(extractedPath, 'package.json');
  const indexHtmlPath = path.join(extractedPath, 'index.html');

  try {
    await fsPromises.access(packageJsonPath);
    return extractedPath; // package.json at root - OK
  } catch {
    // package.json not at root, continue checking
  }

  try {
    await fsPromises.access(indexHtmlPath);
    return extractedPath; // index.html at root - OK (static site)
  } catch {
    // index.html not at root, continue checking
  }

  // Look for a single subdirectory containing the project
  const entries = await fsPromises.readdir(extractedPath);
  const subdirs: string[] = [];

  for (const entry of entries) {
    // Skip hidden files and macOS resource fork directory
    if (entry.startsWith('.') || entry === '__MACOSX') {
      continue;
    }

    const entryPath = path.join(extractedPath, entry);
    try {
      const stat = await fsPromises.stat(entryPath);
      if (stat.isDirectory()) {
        subdirs.push(entry);
      }
    } catch {
      // Skip entries we can't stat
    }
  }

  // If exactly one subdirectory, check if it contains the project
  if (subdirs.length === 1) {
    const nestedPath = path.join(extractedPath, subdirs[0]);
    const nestedPackageJson = path.join(nestedPath, 'package.json');
    const nestedIndexHtml = path.join(nestedPath, 'index.html');

    let hasPackage = false;
    let hasIndex = false;

    try {
      await fsPromises.access(nestedPackageJson);
      hasPackage = true;
    } catch {
      // No package.json in nested dir
    }

    try {
      await fsPromises.access(nestedIndexHtml);
      hasIndex = true;
    } catch {
      // No index.html in nested dir
    }

    if (hasPackage || hasIndex) {
      logger.info(`Found project in nested directory: ${subdirs[0]}/`);
      return nestedPath;
    }
  }

  // Return original path, let caller handle the error
  return extractedPath;
}
