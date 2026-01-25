import express from 'express';
import { createServer } from 'http';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
// import { projectRegistry } from './services/projectRegistry'; // Assuming this exists or will be auto-imported if I use it?
// Actually I need to import it.
import { projectRegistry } from './services/projectRegistry';

import { authRouter } from './routes/auth';
import { deploymentRouter } from './routes/deploy';
import { processRouter } from './routes/process';
import { envRouter } from './routes/env';
import { servicesRouter } from './routes/services';
import { metricsRouter } from './routes/metrics';
import { initWebSocket } from './websocket';
import { pm2Service } from './services/pm2Service';

const app = express();
const httpServer = createServer(app);
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/project', deploymentRouter);
app.use('/api/process', processRouter);
app.use('/api/env', envRouter);
app.use('/api/services', servicesRouter);
app.use('/api/metrics', metricsRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res, next) => {
  res.status(404).json({ success: false, error: 'Not Found' });
});

// Global error handler
app.use(errorHandler);

// Initialize WebSocket
initWebSocket(httpServer);

httpServer.listen(port, async () => {
  logger.info(`Control Plane running on http://localhost:${port}`);
  
  // Reconcile processes on boot
  try {
    const projects = await projectRegistry.getAll();
    await pm2Service.reconcile(projects);
  } catch (error) {
    logger.error('Failed to reconcile processes on boot', error);
  }
});
