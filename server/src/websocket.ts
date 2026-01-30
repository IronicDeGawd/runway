import { Server as HttpServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import pm2 from 'pm2';
import os from 'os';
import { statfs } from 'node:fs/promises';
import { getAuthConfig } from './config/auth';
import { logger } from './utils/logger';
import { eventBus, RealtimeEvent, EventPayloadMap } from './events/eventBus';

interface ExtendedWebSocket extends WebSocket {
  projectId?: string; // For log subscriptions
  channels?: Set<string>; // For realtime subscriptions
  isAlive: boolean;
}

// Global interval tracking for cleanup
let metricsInterval: NodeJS.Timeout | null = null;
let diskUsageCache: { value: number; timestamp: number } | null = null;
const DISK_CACHE_TTL = 900000; // Cache disk usage for 15 minutes (15 * 60 * 1000)

// PM2 bus reference for cleanup
let pm2Bus: any = null;

// Event listener cleanup function
let eventBroadcastingCleanup: (() => void) | null = null;

export const initWebSocket = (server: HttpServer) => {
  logger.info('🔌 Initializing WebSocket servers...');
  
  // Create WebSocket servers without path restriction (we'll filter in handleUpgrade)
  const logsWss = new WebSocketServer({ noServer: true });
  logger.info('✅ Logs WebSocket server created');
  
  const realtimeWss = new WebSocketServer({ noServer: true });
  logger.info('✅ Realtime WebSocket server created');

  // Setup handlers
  setupLogsWebSocket(logsWss);
  setupRealtimeWebSocket(realtimeWss);
  
  // Manually handle upgrade events and route to correct WebSocket server
  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url || '', `http://${request.headers.host}`).pathname;
    logger.info(`⬆️ Upgrade request for path: ${pathname}`);
    
    if (pathname === '/api/logs') {
      logsWss.handleUpgrade(request, socket, head, (ws) => {
        logsWss.emit('connection', ws, request);
      });
    } else if (pathname === '/api/realtime') {
      realtimeWss.handleUpgrade(request, socket, head, (ws) => {
        realtimeWss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });
  
  logger.info('🚀 WebSocket servers ready');
};

// Logs WebSocket Handler (existing)
function setupLogsWebSocket(wss: WebSocketServer) {
  wss.on('connection', (ws: ExtendedWebSocket, req) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    // Auth
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      ws.close(1008, 'Token required');
      return;
    }

    const config = getAuthConfig();
    if (!config) {
      ws.close(1011, 'Auth not configured');
      return;
    }

    try {
      jwt.verify(token, config.jwtSecret);
    } catch (error) {
      ws.close(1008, 'Invalid token');
      return;
    }

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        if (data.action === 'subscribe' && typeof data.projectId === 'string') {
          ws.projectId = data.projectId;
          logger.debug(`Client subscribed to logs for ${data.projectId}`);
        }
      } catch (err) {
        logger.warn('Invalid WebSocket message received');
      }
    });
  });

  // Keep-alive
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      const extWs = ws as ExtendedWebSocket;
      if (extWs.isAlive === false) return ws.terminate();
      extWs.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(interval);
    // Clean up PM2 bus listeners to prevent file descriptor leak
    if (pm2Bus) {
      logger.info('Cleaning up PM2 bus listeners');
      pm2Bus.removeAllListeners('log:out');
      pm2Bus.removeAllListeners('log:err');
      pm2Bus = null;
    }
  });

  // PM2 Bus - store reference for cleanup
  pm2.launchBus((err: any, bus: any) => {
    if (err) {
      logger.error('Failed to launch PM2 bus', err);
      return;
    }

    // Store bus reference globally for cleanup
    pm2Bus = bus;
    logger.info('PM2 bus connected');

    bus.on('log:out', (packet: any) => {
      broadcastLog(wss, 'stdout', packet);
    });

    bus.on('log:err', (packet: any) => {
      broadcastLog(wss, 'stderr', packet);
    });
  });
}

const broadcastLog = (wss: WebSocketServer, type: 'stdout' | 'stderr', packet: any) => {
  const projectId = packet.process?.name;
  if (!projectId) return;

  const message = JSON.stringify({
    type: 'log',
    projectId,
    log: packet.data,
    stream: type,
    timestamp: new Date().toISOString()
  });

  wss.clients.forEach((client) => {
    const extClient = client as ExtendedWebSocket;
    if (client.readyState === WebSocket.OPEN && extClient.projectId === projectId) {
      client.send(message);
    }
  });
};

// Realtime WebSocket Handler
function setupRealtimeWebSocket(wss: WebSocketServer) {
  wss.on('connection', (ws: ExtendedWebSocket, req) => {
    logger.info(`WebSocket connection attempt from ${req.socket.remoteAddress}`);
    
    ws.isAlive = true;
    ws.channels = new Set();
    ws.on('pong', () => { ws.isAlive = true; });

    // Auth
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      logger.warn('WebSocket connection rejected: No token provided');
      ws.close(1008, 'Token required');
      return;
    }

    const config = getAuthConfig();
    if (!config) {
      logger.error('WebSocket connection rejected: Auth not configured');
      ws.close(1011, 'Auth not configured');
      return;
    }

    try {
      jwt.verify(token, config.jwtSecret);
      logger.info('✅ WebSocket connection authenticated successfully');
    } catch (error) {
      logger.warn(`WebSocket connection rejected: Invalid token - ${error instanceof Error ? error.message : 'Unknown error'}`);
      ws.close(1008, 'Invalid token');
      return;
    }

    // Handle client messages
    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        if (data.action === 'subscribe' && Array.isArray(data.channels)) {
          data.channels.forEach((channel: string) => ws.channels?.add(channel));
          logger.debug(`Client subscribed to channels: ${data.channels.join(', ')}`);
          
          // Start metrics broadcast if someone subscribes to metrics
          if (data.channels.includes('metrics')) {
            ensureMetricsBroadcast(wss);
          }
        }
        
        if (data.action === 'unsubscribe' && Array.isArray(data.channels)) {
          data.channels.forEach((channel: string) => ws.channels?.delete(channel));
          
          // Stop metrics broadcast if no one is subscribed anymore
          if (data.channels.includes('metrics')) {
            checkAndStopMetricsBroadcast(wss);
          }
        }

        // Handle deployment request
        if (data.action === 'deploy' && data.payload) {
          const { fileData, name, type, deploymentId, mode } = data.payload;
          if (!fileData || !name || !type) {
            ws.send(JSON.stringify({ 
              type: 'deploy:error', 
              error: 'Missing required fields: fileData, name, or type' 
            }));
            return;
          }

          // Import deployment service dynamically to avoid circular deps
          const { handleWebSocketDeployment } = await import('./services/deploymentService');
          await handleWebSocketDeployment(ws, fileData, name, type, deploymentId, mode);
        }
      } catch (err) {
        logger.warn('Invalid WebSocket message received', err);
        ws.send(JSON.stringify({ type: 'error', error: 'Invalid message format' }));
      }
    });

    // Handle disconnect
    ws.on('close', () => {
      // Check if we should stop metrics broadcast
      checkAndStopMetricsBroadcast(wss);
    });
  });

  // Keep-alive
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      const extWs = ws as ExtendedWebSocket;
      if (extWs.isAlive === false) return ws.terminate();
      extWs.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(interval);
    stopMetricsBroadcast();
    // Clean up event bus listeners to prevent memory leak
    if (eventBroadcastingCleanup) {
      eventBroadcastingCleanup();
      eventBroadcastingCleanup = null;
    }
  });

  // Subscribe to event bus and broadcast to clients - store cleanup function
  eventBroadcastingCleanup = setupEventBroadcasting(wss);
}

// Event Broadcasting - returns cleanup function to prevent listener accumulation
function setupEventBroadcasting(wss: WebSocketServer): () => void {
  // Store listener references for cleanup
  const processChangeListener = (payload: EventPayloadMap['process:change']) => {
    broadcastToChannel(wss, 'processes', 'process:change', payload);
  };

  const activityNewListener = (payload: EventPayloadMap['activity:new']) => {
    broadcastToChannel(wss, 'activity', 'activity:new', payload);
  };

  const serviceChangeListener = (payload: EventPayloadMap['service:change']) => {
    broadcastToChannel(wss, 'services', 'service:change', payload);
  };

  const projectChangeListener = (payload: EventPayloadMap['project:change']) => {
    broadcastToChannel(wss, 'projects', 'project:change', payload);
  };

  const metricsUpdateListener = (payload: EventPayloadMap['metrics:update']) => {
    broadcastToChannel(wss, 'metrics', 'metrics:update', payload);
  };

  // Register listeners
  eventBus.onEvent('process:change', processChangeListener);
  eventBus.onEvent('activity:new', activityNewListener);
  eventBus.onEvent('service:change', serviceChangeListener);
  eventBus.onEvent('project:change', projectChangeListener);
  eventBus.onEvent('metrics:update', metricsUpdateListener);

  // Return cleanup function
  return () => {
    logger.info('Cleaning up event bus listeners');
    eventBus.offEvent('process:change', processChangeListener);
    eventBus.offEvent('activity:new', activityNewListener);
    eventBus.offEvent('service:change', serviceChangeListener);
    eventBus.offEvent('project:change', projectChangeListener);
    eventBus.offEvent('metrics:update', metricsUpdateListener);
  };
}

// Broadcast to specific channel
function broadcastToChannel<T extends RealtimeEvent>(
  wss: WebSocketServer,
  channel: string,
  eventType: T,
  payload: EventPayloadMap[T]
) {
  const message = JSON.stringify({
    type: eventType,
    data: payload
  });

  wss.clients.forEach((client) => {
    const extClient = client as ExtendedWebSocket;
    if (
      client.readyState === WebSocket.OPEN &&
      extClient.channels?.has(channel)
    ) {
      client.send(message);
    }
  });
}

// Check if any clients are subscribed to metrics
function hasMetricsSubscribers(wss: WebSocketServer): boolean {
  for (const client of wss.clients) {
    const extClient = client as ExtendedWebSocket;
    if (extClient.channels?.has('metrics')) {
      return true;
    }
  }
  return false;
}

// Start metrics broadcast only if not already running
function ensureMetricsBroadcast(wss: WebSocketServer) {
  if (metricsInterval) {
    logger.debug('Metrics broadcast already running');
    return;
  }
  
  logger.info('Starting metrics broadcast');
  metricsInterval = setInterval(async () => {
    // Only broadcast if someone is subscribed
    if (!hasMetricsSubscribers(wss)) {
      logger.debug('No metrics subscribers, skipping broadcast');
      return;
    }

    try {
      const metrics = await getSystemMetrics();
      eventBus.emitEvent('metrics:update', metrics);
    } catch (error) {
      logger.error('Failed to get system metrics', error);
    }
  }, 5000);
}

// Stop metrics broadcast if no subscribers
function checkAndStopMetricsBroadcast(wss: WebSocketServer) {
  if (!hasMetricsSubscribers(wss)) {
    stopMetricsBroadcast();
  }
}

// Stop metrics broadcast
function stopMetricsBroadcast() {
  if (metricsInterval) {
    logger.info('Stopping metrics broadcast (no subscribers)');
    clearInterval(metricsInterval);
    metricsInterval = null;
  }
}

// Get system metrics (optimized version)
async function getSystemMetrics() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  // CPU calculation using load average (no shell, no blocking)
  const [load1] = os.loadavg();
  const cpuCount = os.cpus().length;
  // Load average represents processes waiting, convert to approximate percentage
  const cpuUsage = Math.min((load1 / cpuCount) * 100, 100);

  // Disk usage with caching (reduces shell spawns by 12x)
  const diskUsage = await getCachedDiskUsage();

  return {
    cpu: Math.round(cpuUsage * 10) / 10,
    memory: Math.round((usedMem / totalMem) * 100 * 10) / 10,
    disk: diskUsage,
    uptime: Math.floor(os.uptime()),
    totalMemory: totalMem,
    usedMemory: usedMem
  };
}

// Get disk usage with caching (only check every 15 minutes)
async function getCachedDiskUsage(): Promise<number> {
  const now = Date.now();
  
  // Return cached value if still fresh (within 15 minutes)
  if (diskUsageCache && (now - diskUsageCache.timestamp) < DISK_CACHE_TTL) {
    return diskUsageCache.value;
  }

  // Fetch fresh disk usage
  let diskUsage = 0;
  try {
    // Use Node.js native statfs instead of shell
    const stats = await statfs('/');
    
    // Calculate percentage used
    const totalBlocks = stats.blocks;
    const freeBlocks = stats.bfree;
    const usedBlocks = totalBlocks - freeBlocks;
    diskUsage = Math.round((usedBlocks / totalBlocks) * 100 * 10) / 10;
    
    // Update cache
    diskUsageCache = {
      value: diskUsage,
      timestamp: now
    };
  } catch (error) {
    logger.warn('Failed to get disk usage, using cached or default value', error);
    // Return cached value if available, otherwise 0
    diskUsage = diskUsageCache?.value || 0;
  }

  return diskUsage;
}