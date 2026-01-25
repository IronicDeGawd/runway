import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { validateRequest } from '../middleware/validateRequest';
import { envService } from '../services/envService';
import { projectRegistry } from '../services/projectRegistry';
import { AppError } from '../middleware/errorHandler';
import { activityLogger } from '../services/activityLogger';

const router = Router();

const EnvUpdateSchema = z.object({
  body: z.object({
    env: z.record(z.string()),
  }),
});

// Get Envs
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const project = await projectRegistry.getById(req.params.id);
    if (!project) return next(new AppError('Project not found', 404));

    const env = await envService.getEnv(req.params.id);
    res.json({ success: true, data: env });
  } catch (error) {
    next(error);
  }
});

// Update Envs
router.post('/:id', requireAuth, validateRequest(EnvUpdateSchema), async (req, res, next) => {
  try {
    const project = await projectRegistry.getById(req.params.id);
    if (!project) return next(new AppError('Project not found', 404));

    await envService.saveEnv(req.params.id, req.body.env);
    
    // Log activity
    await activityLogger.log('config', project.name, 'Environment variables updated');
    
    // Determine required action based on project type
    let actionRequired: 'restart' | 'rebuild' | 'none' = 'none';
    if (project.type === 'react') {
      actionRequired = 'rebuild'; // Frontend needs rebuild
    } else if (project.type === 'next' || project.type === 'node') {
      actionRequired = 'restart'; // Backend needs restart
    }
    
    res.json({ 
      success: true, 
      message: 'Environment variables updated',
      actionRequired,
      actionMessage: actionRequired === 'rebuild' 
        ? 'Frontend ENV changed - redeploy to apply' 
        : actionRequired === 'restart'
        ? 'Backend ENV changed - restart to apply'
        : null
    });
  } catch (error) {
    next(error);
  }
});

export const envRouter = router;
