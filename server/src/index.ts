import express from 'express';
import pino from 'pino';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';

import { authRouter } from './routes/auth';
import { deploymentRouter } from './routes/deploy';

const app = express();
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

app.listen(port, () => {
  logger.info(`Control Plane running on http://localhost:${port}`);
});
