import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { validateRequest } from '../middleware/validateRequest';
import { pm2Service } from '../services/pm2Service';
import { projectRegistry } from '../services/projectRegistry';
import { AppError } from '../middleware/errorHandler';
import { deploymentService } from '../services/deploymentService'; // For delete?
// Or we should put delete logic in projectRegistry/deploymentService? 
// process.ts should focus on process control. Delete project involves removing files, etc.
// Phase 3 calls it "Process Control".
// But Phase 2 "Deployment Service" handles files.
// Let's instantiate deletion logic here or in deploymentService. 
// Ideally deploymentService handles the Project lifecycle.
import { logger } from '../utils/logger';
import fs from 'fs-extra';
import path from 'path';

const router = Router();

// Validate project existence middleware or helper
const getProject = async (id: string) => {
  const project = await projectRegistry.getById(id);
  if (!project) throw new AppError('Project not found', 404);
  return project;
};

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
    
    // Stop process
    await pm2Service.deleteProject(id);
    
    // Release port
    await import('../services/portManager').then(m => m.portManager.releasePort(project.port));
    
    // Remove from registry
    await projectRegistry.delete(id);
    
    // Remove files
    // This logic should ideally be in deploymentService.deleteProject(id)
    const APPS_DIR = path.resolve(process.cwd(), '../apps');
    const projectDir = path.join(APPS_DIR, id);
    await fs.remove(projectDir);

    // Update Caddy
    await import('../services/caddyService').then(m => m.caddyService.updateConfig());

    logger.info(`Project ${id} deleted`);
    
    res.json({ success: true, message: 'Project deleted' });
  } catch (error) {
    next(error);
  }
});

export const processRouter = router;
