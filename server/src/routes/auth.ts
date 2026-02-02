import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { getAuthConfig } from '../config/auth';
import { validateRequest } from '../middleware/validateRequest';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { authRepository } from '../repositories';

const router = Router();

const LoginSchema = z.object({
  body: z.object({
    username: z.string(),
    password: z.string(),
  }),
});

router.post('/login', validateRequest(LoginSchema), async (req, res, next) => {
  const { username, password } = req.body;
  const config = getAuthConfig();

  if (!config) {
    return next(new AppError('Authentication not initialized', 503));
  }

  if (username !== config.username) {
    // Timing attack mitigation (mock compare) - optional but good practice
    await bcrypt.compare(password, config.passwordHash); 
    return next(new AppError('Invalid credentials', 401));
  }

  const isMatch = await bcrypt.compare(password, config.passwordHash);

  if (!isMatch) {
    return next(new AppError('Invalid credentials', 401));
  }

  const token = jwt.sign({ username }, config.jwtSecret, { expiresIn: '8h' });

  logger.info(`User ${username} logged in successfully`);

  res.json({
    success: true,
    token,
    mustResetPassword: config.mustResetPassword ?? false
  });
});

const ResetPasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(6, 'New password must be at least 6 characters'),
  }),
});

router.post('/reset-password', validateRequest(ResetPasswordSchema), async (req, res, next) => {
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

  logger.info(`User ${config.username} reset their password`);

  // Generate new token
  const token = jwt.sign({ username: config.username }, config.jwtSecret, { expiresIn: '8h' });

  res.json({
    success: true,
    message: 'Password reset successfully',
    token
  });
});

export const authRouter = router;
