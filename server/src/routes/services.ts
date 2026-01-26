import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { dockerService } from '../services/dockerService';
import { AppError } from '../middleware/errorHandler';
import { validateRequest } from '../middleware/validateRequest';

const router = Router();

const CreateServiceSchema = z.object({
  body: z.object({
    type: z.enum(['postgres', 'redis']),
    port: z.number().int().min(1024).max(65535).optional(),
    credentials: z.object({
      username: z.string().optional(),
      password: z.string().optional(),
      database: z.string().optional(),
    }).optional(),
  }),
});

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const services = await dockerService.getServices();
    res.json({ success: true, data: services });
  } catch (error) {
    next(error);
  }
});

router.post('/create', requireAuth, validateRequest(CreateServiceSchema), async (req, res, next) => {
  try {
    const { type, port, credentials } = req.body;
    await dockerService.createService(type, { port, credentials });
    res.json({ success: true, message: `${type} service created and started` });
  } catch (error) {
    next(error);
  }
});

router.post('/:type/start', requireAuth, async (req, res, next) => {
  try {
    const { type } = req.params;
    if (type !== 'postgres' && type !== 'redis') {
        throw new AppError('Invalid service type', 400);
    }
    await dockerService.startService(type);
    res.json({ success: true, message: `${type} started` });
  } catch (error) {
    next(error);
  }
});

router.post('/:type/stop', requireAuth, async (req, res, next) => {
    try {
      const { type } = req.params;
      if (type !== 'postgres' && type !== 'redis') {
          throw new AppError('Invalid service type', 400);
      }
      await dockerService.stopService(type);
      res.json({ success: true, message: `${type} stopped` });
    } catch (error) {
      next(error);
    }
  });

router.delete('/:type', requireAuth, async (req, res, next) => {
  try {
    const { type } = req.params;
    if (type !== 'postgres' && type !== 'redis') {
        throw new AppError('Invalid service type', 400);
    }
    await dockerService.deleteService(type);
    res.json({ success: true, message: `${type} service removed` });
  } catch (error) {
    next(error);
  }
});

export const servicesRouter = router;
