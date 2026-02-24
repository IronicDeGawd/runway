import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { dockerService } from '../services/dockerService';
import { AppError } from '../middleware/errorHandler';
import { validateRequest } from '../middleware/validateRequest';

const router = Router();

const CreateServiceSchema = z.object({
  body: z.object({
    type: z.enum(['postgres', 'redis']),
    name: z.string().min(1).max(30).regex(/^[a-zA-Z0-9-_ ]+$/, 'Name may only contain letters, numbers, hyphens, underscores, and spaces'),
    port: z.number().int().min(1024).max(65535).optional(),
    credentials: z.object({
      username: z.string().optional(),
      password: z.string().optional(),
      database: z.string().optional(),
    }).optional(),
  }),
});

const ConfigureServiceSchema = z.object({
  body: z.object({
    port: z.number().int().min(1024).max(65535).optional(),
    credentials: z.object({
      username: z.string().min(1).optional(),
      password: z.string().min(1).optional(),
      database: z.string().min(1).optional(),
    }).optional(),
  }),
});

// ── Managed services ────────────────────────────────────────────────────────

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const services = await dockerService.getServices();
    res.json({ success: true, data: services });
  } catch (error) {
    next(error);
  }
});

router.post('/create', requireAuth, validateRequest(CreateServiceSchema), async (req, res, next) => {
  try {
    const { type, name, port, credentials } = req.body;
    const result = await dockerService.createService(type, name, { port, credentials });
    res.json({ success: true, message: `${type} service "${name}" created on port ${result.port}`, port: result.port, warnings: result.warnings });
  } catch (error) {
    next(error);
  }
});

router.post('/:name/start', requireAuth, async (req, res, next) => {
  try {
    await dockerService.startService(req.params.name);
    res.json({ success: true, message: `${req.params.name} started` });
  } catch (error) {
    next(error);
  }
});

router.post('/:name/stop', requireAuth, async (req, res, next) => {
  try {
    await dockerService.stopService(req.params.name);
    res.json({ success: true, message: `${req.params.name} stopped` });
  } catch (error) {
    next(error);
  }
});

router.delete('/:name', requireAuth, async (req, res, next) => {
  try {
    await dockerService.deleteService(req.params.name);
    res.json({ success: true, message: `${req.params.name} deleted` });
  } catch (error) {
    next(error);
  }
});

router.put('/:name/configure', requireAuth, validateRequest(ConfigureServiceSchema), async (req, res, next) => {
  try {
    const { port, credentials } = req.body;
    await dockerService.configureService(req.params.name, { port, credentials });
    res.json({ success: true, message: `${req.params.name} reconfigured and restarted` });
  } catch (error) {
    next(error);
  }
});

// ── External (non-Runway) Docker containers ─────────────────────────────────

router.get('/external', requireAuth, async (req, res, next) => {
  try {
    const containers = await dockerService.getExternalContainers();
    res.json({ success: true, data: containers });
  } catch (error) {
    next(error);
  }
});

router.post('/external/:id/start', requireAuth, async (req, res, next) => {
  try {
    await dockerService.startContainer(req.params.id);
    res.json({ success: true, message: 'Container started' });
  } catch (error) {
    next(error);
  }
});

router.post('/external/:id/stop', requireAuth, async (req, res, next) => {
  try {
    await dockerService.stopContainer(req.params.id);
    res.json({ success: true, message: 'Container stopped' });
  } catch (error) {
    next(error);
  }
});

router.post('/external/:id/restart', requireAuth, async (req, res, next) => {
  try {
    await dockerService.restartContainer(req.params.id);
    res.json({ success: true, message: 'Container restarted' });
  } catch (error) {
    next(error);
  }
});

// ── External (non-Runway) Docker containers ──────────────────────────────────

router.get('/external', requireAuth, async (req, res, next) => {
  try {
    const containers = await dockerService.getExternalContainers();
    res.json({ success: true, data: containers });
  } catch (error) {
    next(error);
  }
});

router.post('/external/:id/start', requireAuth, async (req, res, next) => {
  try {
    await dockerService.startContainer(req.params.id);
    res.json({ success: true, message: 'Container started' });
  } catch (error) {
    next(error);
  }
});

router.post('/external/:id/stop', requireAuth, async (req, res, next) => {
  try {
    await dockerService.stopContainer(req.params.id);
    res.json({ success: true, message: 'Container stopped' });
  } catch (error) {
    next(error);
  }
});

router.post('/external/:id/restart', requireAuth, async (req, res, next) => {
  try {
    await dockerService.restartContainer(req.params.id);
    res.json({ success: true, message: 'Container restarted' });
  } catch (error) {
    next(error);
  }
});

export const servicesRouter = router;
