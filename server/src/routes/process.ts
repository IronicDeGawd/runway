import { Router } from 'express';
import { z } from 'zod';
import { ProjectConfig } from '@pdcp/shared';
import { requireAuth } from '../middleware/auth';
import { validateRequest } from '../middleware/validateRequest';
import { pm2Service } from '../services/pm2Service';
import { projectRegistry } from '../services/projectRegistry';
import { portManager } from '../services/portManager';
import { caddyConfigManager } from '../services/caddyConfigManager';
import { AppError } from '../middleware/errorHandler';
import { deploymentService } from '../services/deploymentService';
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
    const processes = await pm2Service.getProcesses();
    res.json({ success: true, data: processes });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/start', requireAuth, async (req, res, next) => {
  try {
    const project = await getProject(req.params.id);
    await pm2Service.startProject(project);
    res.json({ success: true, message: 'Process started' });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/stop', requireAuth, async (req, res, next) => {
  try {
    await getProject(req.params.id); // verify existence
    await pm2Service.stopProject(req.params.id);
    res.json({ success: true, message: 'Process stopped' });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/restart', requireAuth, async (req, res, next) => {
  try {
    await getProject(req.params.id);
    await pm2Service.restartProject(req.params.id);
    res.json({ success: true, message: 'Process restarted' });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = req.params.id;
    const project = await getProject(id);
    
    // Stop process (if not React static site)
    if (project.type !== 'react') {
      await pm2Service.deleteProject(id);
    }
    
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

export const processRouter = router;
