import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { AppError } from './errorHandler';

export const validateRequest = (schema: AnyZodObject) => (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    schema.parse({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    next();
  } catch (error) {
    if (error instanceof ZodError) {
      const errorMessages = error.errors.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      // We could throw a 400 AppError here with a joined message, 
      // or enhance AppError to support structural error details.
      // For now, simple 400.
      next(new AppError(`Validation error: ${JSON.stringify(errorMessages)}`, 400));
    } else {
      next(new AppError('Internal validation error', 500));
    }
  }
};
