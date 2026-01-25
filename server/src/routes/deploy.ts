import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod'; // We might need to manually validate parts since multer handles body
import { validateRequest } from '../middleware/validateRequest'; // For other fields
import { requireAuth } from '../middleware/auth';
import { deploymentService } from '../services/deploymentService';
import { AppError } from '../middleware/errorHandler';
import { ProjectType } from '@pdcp/shared';

const router = Router();
const upload = multer({ dest: '../temp_uploads/' });

// Schema for deployment request params (excluding file)
// Note: validateRequest checks req.body. With multer, req.body is populated AFTER upload.
// But validateRequest middleware runs before?
// Usually multer middleware runs first, then body is available.
// Implementation order: upload.single -> validate -> handler

// We need to parse request body fields manually or allow "any" for validateRequest if we use it after.

router.post('/deploy', requireAuth, upload.single('file'), async (req, res, next) => {
  if (!req.file) {
    return next(new AppError('No file uploaded', 400));
  }

  const { name, type } = req.body;

  if (!name || !type) {
    return next(new AppError('Missing name or type', 400));
  }

  // Validate type
  const validTypes: ProjectType[] = ['react', 'next', 'node'];
  if (!validTypes.includes(type)) {
    return next(new AppError('Invalid project type', 400));
  }

  try {
    const project = await deploymentService.deployProject(
      req.file.path,
      name,
      type as ProjectType
    );
    res.json({ success: true, data: project });
  } catch (error) {
    next(error);
  }
});

export const deploymentRouter = router;
