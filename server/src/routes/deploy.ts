import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { validateRequest } from '../middleware/validateRequest';
import { requireAuth } from '../middleware/auth';
import { deploymentService } from '../services/deploymentService';
import { projectRegistry } from '../services/projectRegistry';
import { AppError } from '../middleware/errorHandler';
import { ProjectType } from '@pdcp/shared';
// import { caddyService } from '../services/caddyService'; // Dynamic import used in code

const router = Router();
const upload = multer({ dest: '../temp_uploads/' });

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

const UpdateConfigSchema = z.object({
  body: z.object({
    domains: z.array(z.string()).optional(),
  }),
});

router.patch('/:id', requireAuth, validateRequest(UpdateConfigSchema), async (req, res, next) => {
  try {
     const project = await projectRegistry.getById(req.params.id);
     if (!project) throw new AppError('Project not found', 404);
     
     if (req.body.domains) {
       project.domains = req.body.domains;
       await projectRegistry.update(project.id, project);
       // Update Caddy
       await import('../services/caddyService').then(m => m.caddyService.updateConfig());
     }
     
     res.json({ success: true, data: project });
  } catch (error) {
    next(error);
  }
});

export const deploymentRouter = router;
