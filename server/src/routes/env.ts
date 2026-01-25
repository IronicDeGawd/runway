import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { validateRequest } from '../middleware/validateRequest';
import { envService } from '../services/envService';
import { projectRegistry } from '../services/projectRegistry';
import { AppError } from '../middleware/errorHandler';

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
    
    // Note: Plan says "Backend ENV changes require restart".
    // We don't auto-restart here. UI should prompt or separate action.
    
    res.json({ success: true, message: 'Environment variables updated' });
  } catch (error) {
    next(error);
  }
});

export const envRouter = router;
