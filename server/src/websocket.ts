import { Server as HttpServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import pm2 from 'pm2';
import os from 'os';
import { exec } from 'child_process';
import util from 'util';
import { getAuthConfig } from './config/auth';
import { logger } from './utils/logger';
import { eventBus, RealtimeEvent, EventPayloadMap } from './events/eventBus';

const execAsync = util.promisify(exec);

interface ExtendedWebSocket extends WebSocket {
  projectId?: string; // For log subscriptions
  channels?: Set<string>; // For realtime subscriptions
  isAlive: boolean;
}

export const initWebSocket = (server: HttpServer) => {
  // Log streaming WebSocket (existing)
  const logsWss = new WebSocketServer({ server, path: '/api/logs' });
  
  // Realtime updates WebSocket (new)
  const realtimeWss = new WebSocketServer({ server, path: '/api/realtime' });

  // Setup logs WebSocket (existing functionality)
  setupLogsWebSocket(logsWss);
  
  // Setup realtime WebSocket (new functionality)
  setupRealtimeWebSocket(realtimeWss);
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

  wss.on('close', () => clearInterval(interval));

  // PM2 Bus
  pm2.launchBus((err: any, bus: any) => {
    if (err) {
      logger.error('Failed to launch PM2 bus', err);
      return;
    }

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

// Realtime WebSocket Handler (new)
function setupRealtimeWebSocket(wss: WebSocketServer) {
  wss.on('connection', (ws: ExtendedWebSocket, req) => {
    ws.isAlive = true;
    ws.channels = new Set();
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

    // Handle client messages
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        if (data.action === 'subscribe' && Array.isArray(data.channels)) {
          data.channels.forEach((channel: string) => ws.channels?.add(channel));
          logger.debug(`Client subscribed to channels: ${data.channels.join(', ')}`);
        }
        
        if (data.action === 'unsubscribe' && Array.isArray(data.channels)) {
          data.channels.forEach((channel: string) => ws.channels?.delete(channel));
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

  wss.on('close', () => clearInterval(interval));

  // Subscribe to event bus and broadcast to clients
  setupEventBroadcasting(wss);
  
  // Start periodic metrics broadcast
  startMetricsBroadcast(wss);
}

// Event Broadcasting
function setupEventBroadcasting(wss: WebSocketServer) {
  // Process changes
  eventBus.onEvent('process:change', (payload) => {
    broadcastToChannel(wss, 'processes', 'process:change', payload);
  });

  // Activity updates
  eventBus.onEvent('activity:new', (payload) => {
    broadcastToChannel(wss, 'activity', 'activity:new', payload);
  });

  // Service changes
  eventBus.onEvent('service:change', (payload) => {
    broadcastToChannel(wss, 'services', 'service:change', payload);
  });

  // Project changes
  eventBus.onEvent('project:change', (payload) => {
    broadcastToChannel(wss, 'projects', 'project:change', payload);
  });

  // Metrics updates (from event bus)
  eventBus.onEvent('metrics:update', (payload) => {
    broadcastToChannel(wss, 'metrics', 'metrics:update', payload);
  });
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

// Periodic metrics broadcast
function startMetricsBroadcast(wss: WebSocketServer) {
  // Broadcast metrics every 5 seconds
  setInterval(async () => {
    try {
      const metrics = await getSystemMetrics();
      eventBus.emitEvent('metrics:update', metrics);
    } catch (error) {
      logger.error('Failed to get system metrics', error);
    }
  }, 5000);
}

// Get system metrics (similar to /api/metrics route)
async function getSystemMetrics() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  // CPU calculation (simplified)
  const cpus = os.cpus();
  const cpuUsage = cpus.reduce((acc, cpu) => {
    const total = Object.values(cpu.times).reduce((a, b) => a + b);
    const idle = cpu.times.idle;
    return acc + (100 - (100 * idle / total));
  }, 0) / cpus.length;

  // Disk usage
  let diskUsage = 0;
  try {
    const { stdout } = await execAsync("df -h / | tail -1 | awk '{print $5}' | sed 's/%//'");
    diskUsage = parseFloat(stdout.trim());
  } catch (error) {
    // Fallback
  }

  return {
    cpu: Math.round(cpuUsage * 10) / 10,
    memory: Math.round((usedMem / totalMem) * 100 * 10) / 10,
    disk: diskUsage,
    uptime: Math.floor(os.uptime()),
    totalMemory: totalMem,
    usedMemory: usedMem
  };
}
