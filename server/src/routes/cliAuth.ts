import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { validateRequest } from '../middleware/validateRequest';
import { AppError } from '../middleware/errorHandler';
import { getAuthConfig } from '../config/auth';
import { getTokenPolicy, getTokenExpirySeconds } from '../config/tokenPolicy';
import { systemRepository } from '../repositories/systemRepository';
import { authRepository } from '../repositories';
import { rsaKeyManager } from '../services/rsaKeyManager';
import { dnsVerifier } from '../services/dnsVerifier';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /api/cli/security-mode
 * Returns current security mode and server information for CLI
 */
router.get('/security-mode', async (req, res, next) => {
  try {
    const securityMode = systemRepository.getSecurityMode();
    const domain = systemRepository.getDomain();

    // Get server IP (may be cached)
    let serverIp = systemRepository.getServerIp();
    if (!serverIp) {
      try {
        serverIp = await dnsVerifier.getServerPublicIp();
        systemRepository.updateServerIp(serverIp);
      } catch {
        serverIp = null;
      }
    }

    const policy = getTokenPolicy(securityMode);

    res.json({
      success: true,
      data: {
        securityMode,
        serverIp,
        domain: domain?.domain || null,
        domainActive: domain?.active || false,
        requiresRSA: policy.requiresRSA,
        tokenMaxAge: policy.maxAge,
        tokenType: policy.type,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/cli/public-key
 * Returns RSA public key for credential encryption (HTTP mode only)
 */
router.get('/public-key', async (req, res, next) => {
  try {
    const securityMode = systemRepository.getSecurityMode();

    if (securityMode === 'domain-https') {
      return res.status(400).json({
        success: false,
        error: 'RSA not required in HTTPS mode. Use standard authentication.',
      });
    }

    // Ensure RSA keys are initialized
    if (!rsaKeyManager.isInitialized()) {
      await rsaKeyManager.initialize();
    }

    res.json({
      success: true,
      data: {
        publicKey: rsaKeyManager.getPublicKey(),
      },
      warning:
        'RSA key exchange over HTTP is vulnerable to MITM attacks. ' +
        'Configure a domain for secure authentication.',
    });
  } catch (error) {
    next(error);
  }
});

// Schema for RSA-encrypted auth (HTTP mode)
const RSAAuthSchema = z.object({
  body: z.object({
    encryptedCredentials: z.string().min(1, 'Encrypted credentials required'),
  }),
});

// Schema for direct auth (HTTPS mode)
const DirectAuthSchema = z.object({
  body: z.object({
    username: z.string().min(1, 'Username required'),
    password: z.string().min(1, 'Password required'),
  }),
});

/**
 * POST /api/cli/auth
 * Authenticate CLI - handles both RSA (HTTP) and direct (HTTPS) modes
 */
router.post('/auth', async (req, res, next) => {
  try {
    const securityMode = systemRepository.getSecurityMode();
    const policy = getTokenPolicy(securityMode);
    const config = getAuthConfig();

    if (!config) {
      return next(new AppError('Authentication not initialized', 503));
    }

    let username: string;
    let password: string;

    if (policy.requiresRSA) {
      // RSA-encrypted credentials (HTTP mode)
      const result = RSAAuthSchema.safeParse({ body: req.body });
      if (!result.success) {
        return next(
          new AppError('RSA-encrypted credentials required for HTTP mode', 400)
        );
      }

      const { encryptedCredentials } = req.body;

      // Ensure RSA keys are initialized
      if (!rsaKeyManager.isInitialized()) {
        await rsaKeyManager.initialize();
      }

      try {
        const decrypted = rsaKeyManager.decrypt(encryptedCredentials);
        const parsed = JSON.parse(decrypted);
        username = parsed.username;
        password = parsed.password;

        if (!username || !password) {
          return next(new AppError('Invalid encrypted credentials format', 400));
        }
      } catch (error) {
        logger.warn('Failed to decrypt CLI credentials', error);
        return next(new AppError('Failed to decrypt credentials', 400));
      }
    } else {
      // Direct auth over HTTPS
      const result = DirectAuthSchema.safeParse({ body: req.body });
      if (!result.success) {
        return next(new AppError('Username and password required', 400));
      }

      username = req.body.username;
      password = req.body.password;
    }

    // Verify credentials
    if (username !== config.username) {
      // Timing attack mitigation
      await bcrypt.compare(password, config.passwordHash);
      return next(new AppError('Invalid credentials', 401));
    }

    const isMatch = await bcrypt.compare(password, config.passwordHash);
    if (!isMatch) {
      return next(new AppError('Invalid credentials', 401));
    }

    // Generate token with appropriate lifetime
    const expiresIn = getTokenExpirySeconds(securityMode);
    const token = jwt.sign(
      {
        username,
        source: 'cli',
        tokenType: policy.type,
      },
      config.jwtSecret,
      { expiresIn }
    );

    // Calculate expiry timestamp
    const expiresAt = new Date(Date.now() + policy.maxAge).toISOString();

    logger.info(`CLI user ${username} authenticated (${securityMode} mode)`);

    res.json({
      success: true,
      data: {
        token,
        expiresIn: policy.maxAge,
        expiresAt,
        tokenType: policy.type,
        securityMode,
        mustResetPassword: config.mustResetPassword ?? false,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/cli/refresh
 * Refresh CLI token (only available in HTTPS mode)
 */
router.post('/refresh', async (req, res, next) => {
  try {
    const securityMode = systemRepository.getSecurityMode();
    const policy = getTokenPolicy(securityMode);

    if (!policy.refreshable) {
      return res.status(400).json({
        success: false,
        error: 'Token refresh not available in HTTP mode. Please re-authenticate.',
      });
    }

    // Token validation is handled by auth middleware
    // For now, just require a valid token in the Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return next(new AppError('Authorization token required', 401));
    }

    const token = authHeader.substring(7);
    const config = getAuthConfig();

    if (!config) {
      return next(new AppError('Authentication not initialized', 503));
    }

    try {
      const decoded = jwt.verify(token, config.jwtSecret) as {
        username: string;
        source?: string;
      };

      // Generate new token
      const expiresIn = getTokenExpirySeconds(securityMode);
      const newToken = jwt.sign(
        {
          username: decoded.username,
          source: 'cli',
          tokenType: policy.type,
        },
        config.jwtSecret,
        { expiresIn }
      );

      const expiresAt = new Date(Date.now() + policy.maxAge).toISOString();

      logger.info(`CLI token refreshed for ${decoded.username}`);

      res.json({
        success: true,
        data: {
          token: newToken,
          expiresIn: policy.maxAge,
          expiresAt,
          tokenType: policy.type,
          securityMode,
        },
      });
    } catch (error) {
      return next(new AppError('Invalid or expired token', 401));
    }
  } catch (error) {
    next(error);
  }
});

// Schema for password reset
const ResetPasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(6, 'New password must be at least 6 characters'),
  }),
});

/**
 * POST /api/cli/reset-password
 * Reset password from CLI
 */
router.post('/reset-password', validateRequest(ResetPasswordSchema), async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const config = getAuthConfig();

    if (!config) {
      return next(new AppError('Authentication not initialized', 503));
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, config.passwordHash);
    if (!isMatch) {
      return next(new AppError('Current password is incorrect', 401));
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // Update password and clear the reset flag
    authRepository.updatePassword(newPasswordHash, true);

    logger.info(`CLI user ${config.username} reset their password`);

    // Generate new token
    const securityMode = systemRepository.getSecurityMode();
    const policy = getTokenPolicy(securityMode);
    const expiresIn = getTokenExpirySeconds(securityMode);
    const token = jwt.sign(
      {
        username: config.username,
        source: 'cli',
        tokenType: policy.type,
      },
      config.jwtSecret,
      { expiresIn }
    );

    const expiresAt = new Date(Date.now() + policy.maxAge).toISOString();

    res.json({
      success: true,
      message: 'Password reset successfully',
      data: {
        token,
        expiresIn: policy.maxAge,
        expiresAt,
        tokenType: policy.type,
        securityMode,
      },
    });
  } catch (error) {
    next(error);
  }
});

export const cliAuthRouter = router;
