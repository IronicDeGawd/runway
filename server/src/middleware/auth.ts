import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getAuthConfig } from '../config/auth';
import { AppError } from './errorHandler';
import { UserSession } from '../types/auth';

declare global {
  namespace Express {
    interface Request {
      user?: UserSession;
    }
  }
}

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return next(new AppError('Unauthorized', 401));
  }

  const token = authHeader.split(' ')[1];
  const config = getAuthConfig();

  if (!config) {
    return next(new AppError('System authentication not configured', 500));
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as UserSession;
    req.user = decoded;
    next();
  } catch (error) {
    return next(new AppError('Invalid token', 401));
  }
};
