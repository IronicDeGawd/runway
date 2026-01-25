import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { dockerService } from '../services/dockerService';
import { AppError } from '../middleware/errorHandler';

const router = Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const services = await dockerService.getServices();
    res.json({ success: true, data: services });
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

export const servicesRouter = router;
