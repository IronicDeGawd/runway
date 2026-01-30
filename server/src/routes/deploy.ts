import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs-extra';
import { z } from 'zod';
import { validateRequest } from '../middleware/validateRequest';
import { requireAuth } from '../middleware/auth';
import { deploymentService } from '../services/deploymentService';
import { projectRegistry } from '../services/projectRegistry';
import { caddyConfigManager } from '../services/caddyConfigManager';
import { DeployAnalyzer } from '../services/deployAnalyzer';
import { AppError } from '../middleware/errorHandler';
import { ProjectType } from '@runway/shared';
import { extractZip } from '../services/zipService';

const router = Router();
const upload = multer({ dest: '../temp_uploads/' });

// Get all projects
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const projects = await projectRegistry.getAll();
    res.json({ success: true, data: projects });
  } catch (error) {
    next(error);
  }
});

// Get project by ID
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const project = await projectRegistry.getById(req.params.id);
    if (!project) return next(new AppError('Project not found', 404));
    res.json({ success: true, data: project });
  } catch (error) {
    next(error);
  }
});

// Get deployment status
router.get('/status/:id', requireAuth, (req, res, next) => {
  const status = deploymentService.getDeploymentStatus(req.params.id);
  if (!status) {
    return next(new AppError('Deployment not found', 404));
  }
  res.json({ success: true, data: status });
});

// Analyze package before deployment
router.post('/analyze', requireAuth, upload.single('file'), async (req, res, next) => {
  if (!req.file) {
    return next(new AppError('No file uploaded', 400));
  }

  const tempDir = path.join('../temp_uploads/', `analyze_${Date.now()}`);

  try {
    // Extract zip to temp directory
    await extractZip(req.file.path, tempDir);

    // Run analysis
    const analysis = await DeployAnalyzer.analyze(tempDir, {
      declaredType: req.body.type as ProjectType | undefined,
    });

    res.json({ success: true, data: analysis });
  } catch (error) {
    next(error);
  } finally {
    // Cleanup
    await fs.remove(tempDir).catch(() => {});
    await fs.remove(req.file.path).catch(() => {});
  }
});

// Rebuild an existing project
router.post('/:id/rebuild', requireAuth, async (req, res, next) => {
  try {
    const project = await projectRegistry.getById(req.params.id);
    if (!project) {
      return next(new AppError('Project not found', 404));
    }

    // Check if project type supports rebuild
    if (project.type === 'static') {
      return next(new AppError('Static projects cannot be rebuilt', 400));
    }

    const updatedProject = await deploymentService.rebuildProject(project.id);
    res.json({ success: true, data: updatedProject });
  } catch (error) {
    next(error);
  }
});

router.post('/deploy', requireAuth, upload.single('file'), async (req, res, next) => {
  if (!req.file) {
    return next(new AppError('No file uploaded', 400));
  }

  const { name, type, buildMode, confirmServerBuild, forceBuild, domains } = req.body;

  if (!name || !type) {
    return next(new AppError('Missing name or type', 400));
  }

  // Validate type
  const validTypes: ProjectType[] = ['react', 'next', 'node', 'static'];
  if (!validTypes.includes(type)) {
    return next(new AppError('Invalid project type', 400));
  }

  // Parse boolean values from form data
  const confirm = confirmServerBuild === 'true' || confirmServerBuild === true;
  const force = forceBuild === 'true' || forceBuild === true;

  // Parse domains if provided
  let parsedDomains: string[] | undefined;
  if (domains) {
    try {
      parsedDomains = typeof domains === 'string' ? JSON.parse(domains) : domains;
    } catch {
      parsedDomains = undefined;
    }
  }

  try {
    const project = await deploymentService.deployProject(
      req.file.path,
      name,
      type as ProjectType,
      {
        buildMode: buildMode || 'server',
        confirmServerBuild: confirm,
        forceBuild: force,
        domains: parsedDomains,
      }
    );
    res.json({ success: true, data: project });
  } catch (error) {
    next(error);
  }
});

// Deploy pre-built artifacts (from CLI local build)
router.post('/deploy-prebuilt', requireAuth, upload.single('file'), async (req, res, next) => {
  if (!req.file) {
    return next(new AppError('No file uploaded', 400));
  }

  const { name, type, version } = req.body;

  if (!name || !type) {
    return next(new AppError('Missing name or type', 400));
  }

  // Validate type
  const validTypes: ProjectType[] = ['react', 'next', 'node', 'static'];
  if (!validTypes.includes(type)) {
    return next(new AppError('Invalid project type', 400));
  }

  try {
    const project = await deploymentService.deployPrebuiltProject(
      req.file.path,
      name,
      type as ProjectType,
      version
    );
    res.json({
      success: true,
      data: {
        projectId: project.id,
        project
      }
    });
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
       // Validate domain format
       for (const domain of req.body.domains) {
         const domainRegex = /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/i;
         if (!domainRegex.test(domain)) {
           throw new AppError(`Invalid domain format: ${domain}`, 400);
         }
       }
       
       // Check for conflicts with other projects
       const allProjects = await projectRegistry.getAll();
       const otherProjects = allProjects.filter(p => p.id !== project.id);
       const existingDomains = otherProjects.flatMap(p => p.domains || []);
       const conflicts = req.body.domains.filter((d: string) => existingDomains.includes(d));
       
       if (conflicts.length > 0) {
         throw new AppError(`Domains already in use: ${conflicts.join(', ')}`, 409);
       }
       
       project.domains = req.body.domains;
       await projectRegistry.update(project.id, project);
       
       // Update Caddy with modular config
       await caddyConfigManager.updateProjectConfig(project);
     }
     
     res.json({ success: true, data: project });
  } catch (error) {
    next(error);
  }
});

export const deploymentRouter = router;
