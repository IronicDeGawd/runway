import express from 'express';
import pino from 'pino';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';

import { authRouter } from './routes/auth';
import { deploymentRouter } from './routes/deploy';
import { processRouter } from './routes/process';
import { initWebSocket } from './websocket';
import { createServer } from 'http';
import { pm2Service } from './services/pm2Service';
import { projectRegistry } from './services/projectRegistry';

const app = express();
const httpServer = createServer(app);
const port = parseInt(process.env.PORT || '3000', 10);

app.use(express.json());

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/project', deploymentRouter);
app.use('/api/process', processRouter);

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

