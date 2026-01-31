import { Router } from 'express';
import { z } from 'zod';
import { validateRequest } from '../middleware/validateRequest';
import { AppError } from '../middleware/errorHandler';
import { systemRepository } from '../repositories/systemRepository';
import { dnsVerifier } from '../services/dnsVerifier';
import { caddyConfigManager } from '../services/caddyConfigManager';
import { logger } from '../utils/logger';
import { broadcast } from '../websocket';

const router = Router();

// Validation schema for setting domain
const SetDomainSchema = z.object({
  body: z.object({
    domain: z
      .string()
      .min(1, 'Domain is required')
      .regex(
        /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/i,
        'Invalid domain format. Example: example.com or app.example.com'
      )
      .transform((d) => d.toLowerCase()),
  }),
});

/**
 * GET /api/domain
 * Get current domain configuration
 */
router.get('/', async (req, res, next) => {
  try {
    const config = systemRepository.getConfig();
    const serverIp = await dnsVerifier.getServerPublicIp().catch(() => null);

    res.json({
      success: true,
      data: {
        domain: config.domain || null,
        securityMode: config.securityMode,
        serverIp: serverIp || config.serverIp || null,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/domain
 * Submit domain for verification and configuration
 */
router.post('/', validateRequest(SetDomainSchema), async (req, res, next) => {
  const { domain } = req.body;

  try {
    logger.info(`Domain configuration requested for: ${domain}`);

    // Verify domain DNS points to this server
    const verificationResult = await dnsVerifier.verifyDomain(domain);

    // Store domain with verification result
    systemRepository.setDomain(domain, verificationResult);

    // Update server IP in database
    if (verificationResult.serverIp) {
      systemRepository.updateServerIp(verificationResult.serverIp);
    }

    if (verificationResult.success) {
      // Update Caddy configuration for system domain
      try {
        await caddyConfigManager.updateSystemConfig(domain);
        logger.info(`Caddy configuration updated for domain: ${domain}`);
      } catch (caddyError) {
        logger.error('Failed to update Caddy config, but domain saved', caddyError);
        // Don't fail the request, domain is saved and can be retried
      }

      // Broadcast domain change event
      broadcast('system:domain-changed', {
        domain,
        securityMode: 'domain-https',
        active: true,
      });

      res.json({
        success: true,
        message: 'Domain verified and configured successfully',
        data: {
          domain,
          verificationResult,
          securityMode: 'domain-https',
        },
      });
    } else {
      // Broadcast domain change event (failed verification)
      broadcast('system:domain-changed', {
        domain,
        securityMode: 'ip-http',
        active: false,
      });

      res.status(400).json({
        success: false,
        message: 'Domain verification failed',
        data: {
          domain,
          verificationResult,
          securityMode: 'ip-http',
        },
      });
    }
  } catch (error) {
    logger.error(`Domain configuration failed for ${domain}:`, error);
    next(error);
  }
});

/**
 * POST /api/domain/verify
 * Re-verify existing domain
 */
router.post('/verify', async (req, res, next) => {
  try {
    const currentDomain = systemRepository.getDomain();

    if (!currentDomain) {
      return next(new AppError('No domain configured', 404));
    }

    logger.info(`Re-verifying domain: ${currentDomain.domain}`);

    // Re-verify domain
    const verificationResult = await dnsVerifier.verifyDomain(currentDomain.domain);

    // Update verification status
    systemRepository.updateVerificationStatus(
      verificationResult.success ? 'verified' : 'failed',
      verificationResult.error
    );

    if (verificationResult.success) {
      // Update Caddy configuration
      try {
        await caddyConfigManager.updateSystemConfig(currentDomain.domain);
      } catch (caddyError) {
        logger.error('Failed to update Caddy config on re-verify', caddyError);
      }

      // Broadcast change
      broadcast('system:domain-changed', {
        domain: currentDomain.domain,
        securityMode: 'domain-https',
        active: true,
      });
    }

    res.json({
      success: verificationResult.success,
      message: verificationResult.success
        ? 'Domain re-verified successfully'
        : 'Domain verification failed',
      data: {
        verificationResult,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/domain
 * Remove domain configuration
 */
router.delete('/', async (req, res, next) => {
  try {
    const currentDomain = systemRepository.getDomain();

    if (!currentDomain) {
      return next(new AppError('No domain configured', 404));
    }

    logger.info(`Removing domain configuration: ${currentDomain.domain}`);

    // Clear domain from database
    systemRepository.clearDomain();

    // Remove system Caddy configuration
    try {
      await caddyConfigManager.removeSystemConfig();
    } catch (caddyError) {
      logger.error('Failed to remove Caddy system config', caddyError);
    }

    // Broadcast change
    broadcast('system:domain-changed', {
      domain: null,
      securityMode: 'ip-http',
      active: false,
    });

    res.json({
      success: true,
      message: 'Domain configuration removed',
      data: {
        securityMode: 'ip-http',
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/domain/status
 * Get security mode status (lightweight endpoint for status checks)
 */
router.get('/status', async (req, res, next) => {
  try {
    const securityMode = systemRepository.getSecurityMode();
    const domain = systemRepository.getDomain();
    let serverIp = systemRepository.getServerIp();

    // Refresh server IP if not cached
    if (!serverIp) {
      try {
        serverIp = await dnsVerifier.getServerPublicIp();
        systemRepository.updateServerIp(serverIp);
      } catch (error) {
        logger.debug('Could not fetch server IP');
      }
    }

    res.json({
      success: true,
      data: {
        securityMode,
        domain: domain?.domain || null,
        domainActive: domain?.active || false,
        serverIp,
      },
    });
  } catch (error) {
    next(error);
  }
});

export const domainRouter = router;
