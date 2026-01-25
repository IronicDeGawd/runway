import fs from 'fs';
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
    yauzl.open(zipFilePath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);
      if (!zipfile) return reject(new AppError('Failed to open zip file', 500));

      let fileCount = 0;

      // Create destination directory
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      zipfile.readEntry();

      zipfile.on('entry', (entry: yauzl.Entry) => {
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

          zipfile.openReadStream(entry, (err, readStream) => {
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

      zipfile.on('error', (zipErr) => {
        reject(zipErr);
      });
    });
  });
};
