import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { activityLogger } from '../services/activityLogger';

const router = Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    const activities = await activityLogger.getRecent(limit);
    res.json({ success: true, data: activities });
  } catch (error) {
    next(error);
  }
});

export const activityRouter = router;
