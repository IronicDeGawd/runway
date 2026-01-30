import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { logger } from './utils/logger';
import { errorHandler, AppError } from './middleware/errorHandler';
import { projectRegistry } from './services/projectRegistry';
import { caddyConfigManager } from './services/caddyConfigManager';
import { database } from './services/database';
import { authRouter } from './routes/auth';
import { deploymentRouter } from './routes/deploy';
import { processRouter } from './routes/process';
import { envRouter } from './routes/env';
import { servicesRouter } from './routes/services';
import { metricsRouter } from './routes/metrics';
import { activityRouter } from './routes/activity';
import { initWebSocket } from './websocket';
import { pm2Service } from './services/pm2Service';
import { startResourceMonitor } from './services/resourceMonitor'

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
app.use('/api/activity', activityRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files from UI build
// Serve static files from UI build
// const uiDistPath = path.resolve(__dirname, '../../ui/dist');
// app.use(express.static(uiDistPath));

// SPA fallback - serve index.html for all non-API/health routes
// SPA fallback - serve index.html for all non-API/health routes
// app.use((req, res, next) => {
//   // Don't handle API routes or WebSocket
//   if (req.path.startsWith('/api/') || req.path.startsWith('/health') || req.path.startsWith('/socket.io')) {
//     return next();
//   }
//   // Serve index.html for SPA routes
//   res.sendFile(path.join(uiDistPath, 'index.html'));
// });

// Explicit 404 Handler for all unmatched routes (but skip for WebSocket upgrades)
app.use((req, res, next) => {
  // Don't send 404 for WebSocket upgrade requests - they're handled by the WebSocket server
  if (req.headers.upgrade === 'websocket') {
    return next(); // Continue to let WebSocket server handle
  }
  next(new AppError(`Cannot ${req.method} ${req.originalUrl}`, 404));
});

// Global error handler (must be last)
app.use(errorHandler);

// Initialize WebSocket
initWebSocket(httpServer);

httpServer.listen(port, async () => {
  logger.info(`Control Plane running on http://localhost:${port}`);

  // Initialize SQLite database
  try {
    database.initialize();
    logger.info('✅ SQLite database initialized');
  } catch (error) {
    logger.error('Failed to initialize SQLite database', error);
  }

  // Initialize Caddy configuration structure
  try {
    await caddyConfigManager.initialize();
    logger.info('✅ Caddy configuration initialized');
  } catch (error) {
    logger.error('Failed to initialize Caddy config', error);
  }
  
  // Reconcile processes on boot
  try {
    const projects = await projectRegistry.getAll();
    await pm2Service.reconcile(projects);
    logger.info('✅ PM2 processes reconciled');
  } catch (error) {
    logger.error('Failed to reconcile processes on boot', error);
  }

  // Start resource monitoring
  try {
    await startResourceMonitor();
    logger.info('✅ Resource monitor started');
  } catch (error) {
    logger.error('Failed to start resource monitor', error);
  }
});