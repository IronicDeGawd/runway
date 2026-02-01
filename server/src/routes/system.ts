import { Router } from 'express';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { requireAuth } from '../middleware/auth';

const router = Router();

// Get app version from package.json
function getAppVersion(): string {
  try {
    const packageJsonPath = path.join(__dirname, '../../package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    return packageJson.version || 'unknown';
  } catch {
    return 'unknown';
  }
}

// Get last updated time (package.json modification time as proxy)
function getLastUpdated(): string | null {
  try {
    const packageJsonPath = path.join(__dirname, '../../package.json');
    const stats = fs.statSync(packageJsonPath);
    return stats.mtime.toISOString();
  } catch {
    return null;
  }
}

/**
 * GET /api/system
 * Returns system information
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const version = getAppVersion();
    const nodeVersion = process.version;
    const platform = `${os.type()} ${os.arch()}`;
    const hostname = os.hostname();
    const lastUpdated = getLastUpdated();
    const cpuCores = os.cpus().length;
    const totalMemory = os.totalmem();

    res.json({
      success: true,
      data: {
        version,
        nodeVersion,
        platform,
        hostname,
        lastUpdated,
        cpuCores,
        totalMemory,
      },
    });
  } catch (error) {
    next(error);
  }
});

export const systemRouter = router;
