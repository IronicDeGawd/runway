import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { validateRequest } from '../middleware/validateRequest';
import { envManager } from '../services/envManager';
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

    const env = await envManager.getEnv(req.params.id);
    res.json({ success: true, data: env });
  } catch (error) {
    next(error);
  }
});

// Check ENV mutability
router.get('/:id/mutability', requireAuth, async (req, res, next) => {
  try {
    const mutability = await envManager.checkMutability(req.params.id);
    res.json({ success: true, data: mutability });
  } catch (error) {
    next(error);
  }
});

// Update Envs
router.post('/:id', requireAuth, validateRequest(EnvUpdateSchema), async (req, res, next) => {
  try {
    const project = await projectRegistry.getById(req.params.id);
    if (!project) return next(new AppError('Project not found', 404));

    // Check mutability before allowing update
    const mutability = await envManager.checkMutability(req.params.id);
    if (!mutability.mutable) {
      return res.status(403).json({
        success: false,
        error: mutability.message,
        envMutable: false,
        reason: mutability.reason,
      });
    }

    // Save encrypted envs (skip mutability check since we already checked)
    await envManager.setEnv(req.params.id, req.body.env, true);

    // Log activity
    await activityLogger.log('config', project.name, 'Environment variables updated');

    // Apply changes immediately (Runtime Injection)
    await envManager.applyEnv(req.params.id);

    res.json({
      success: true,
      message: 'Environment variables updated and applied',
      actionRequired: 'none'
    });
  } catch (error) {
    next(error);
  }
});

export const envRouter = router;
