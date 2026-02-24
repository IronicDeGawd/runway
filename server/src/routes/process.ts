import { Router } from 'express';
import { z } from 'zod';
import { ProjectConfig } from '@runway/shared';
import { requireAuth } from '../middleware/auth';
import { validateRequest } from '../middleware/validateRequest';
import { processManager } from '../services/processManager';
import { projectRegistry } from '../services/projectRegistry';
import { portManager } from '../services/portManager';
import { caddyConfigManager } from '../services/caddyConfigManager';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { eventBus } from '../events/eventBus';
import fs from 'fs-extra';
import path from 'path';

const router = Router();

// Validate project existence middleware or helper
const getProject = async (id: string): Promise<ProjectConfig> => {
  const project = await projectRegistry.getById(id);
  if (!project) throw new AppError('Project not found', 404);
  return project;
};

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const processes = await processManager.getProcesses();
    res.json({ success: true, data: processes });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/start', requireAuth, async (req, res, next) => {
  try {
    const project = await getProject(req.params.id);
    await processManager.startProject(project);
    res.json({ success: true, message: 'Process started' });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/stop', requireAuth, async (req, res, next) => {
  try {
    const project = await getProject(req.params.id);
    await processManager.stopProject(project);
    res.json({ success: true, message: 'Process stopped' });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/restart', requireAuth, async (req, res, next) => {
  try {
    const project = await getProject(req.params.id);
    await processManager.restartProject(project);
    res.json({ success: true, message: 'Process restarted' });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = req.params.id;
    const project = await getProject(id);
    
    // Stop process (generic)
    await processManager.deleteProject(project);
    
    // Release port
    await portManager.releasePort(project.port);
    
    // Remove Caddy config
    await caddyConfigManager.deleteProjectConfig(id);
    
    // Remove from registry
    await projectRegistry.delete(id);
    
    // Remove files
    const APPS_DIR = path.resolve(process.cwd(), '../apps');
    const projectDir = path.join(APPS_DIR, id);
    await fs.remove(projectDir);

    logger.info(`Project ${id} deleted`);
    
    // Emit event for realtime updates
    eventBus.emitEvent('project:change', {
      action: 'deleted',
      projectId: id
    });
    
    res.json({ success: true, message: 'Project deleted' });
  } catch (error) {
    next(error);
  }
});

// Get PM2/project logs
router.get('/:id/logs', requireAuth, async (req, res, next) => {
  try {
    const project = await getProject(req.params.id);
    const lines = Math.min(parseInt(req.query.lines as string) || 100, 1000);
    const logType = (req.query.type as string) || 'all'; // 'out', 'error', or 'all'

    const APPS_DIR = path.resolve(process.cwd(), '../apps');
    const logsDir = path.join(APPS_DIR, project.id, 'logs');

    const result: { stdout?: string; stderr?: string } = {};

    const readLastLines = async (filePath: string, n: number): Promise<string> => {
      try {
        if (!await fs.pathExists(filePath)) return '';
        const content = await fs.readFile(filePath, 'utf-8');
        const allLines = content.split('\n');
        return allLines.slice(-n).join('\n');
      } catch {
        return '';
      }
    };

    if (logType === 'out' || logType === 'all') {
      result.stdout = await readLastLines(path.join(logsDir, 'out.log'), lines);
    }
    if (logType === 'error' || logType === 'all') {
      result.stderr = await readLastLines(path.join(logsDir, 'error.log'), lines);
    }

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

export const processRouter = router;
