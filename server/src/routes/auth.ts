import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { getAuthConfig } from '../config/auth';
import { validateRequest } from '../middleware/validateRequest';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

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

  res.json({ success: true, token });
});

export const authRouter = router;
