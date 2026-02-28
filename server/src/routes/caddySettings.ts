import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { systemRepository } from '../repositories/systemRepository';
import { caddyConfigManager } from '../services/caddyConfigManager';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /api/caddy/settings — Get Caddy configuration settings
 */
router.get('/settings', requireAuth, (req, res) => {
  const disableAutoHttps = systemRepository.getCaddyDisableAutoHttps();

  res.json({
    success: true,
    data: {
      disableAutoHttps,
    },
  });
});

/**
 * PATCH /api/caddy/settings — Update Caddy configuration settings
 */
router.patch('/settings', requireAuth, async (req, res, next) => {
  try {
    const { disableAutoHttps } = req.body;

    if (typeof disableAutoHttps !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'disableAutoHttps must be a boolean',
      });
    }

    systemRepository.setCaddyDisableAutoHttps(disableAutoHttps);
    logger.info(`Caddy auto_https setting updated: ${disableAutoHttps ? 'disabled' : 'enabled'}`);

    // Regenerate and reload Caddyfile with new setting
    await caddyConfigManager.refreshMainCaddyfile();

    res.json({
      success: true,
      message: `auto_https ${disableAutoHttps ? 'disabled' : 'enabled'}`,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
