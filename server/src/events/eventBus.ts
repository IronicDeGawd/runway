import { EventEmitter } from 'events';

// Event types
export type RealtimeEvent =
  | 'metrics:update'
  | 'process:change'
  | 'activity:new'
  | 'service:change'
  | 'project:change';

// Event payload types
export interface MetricsUpdatePayload {
  cpu: number;
  memory: number;
  disk: number;
  uptime: number;
  totalMemory: number;
  usedMemory: number;
}

export interface ProcessChangePayload {
  projectId: string;
  status: 'running' | 'stopped' | 'failed' | 'building';
  cpu?: number;
  memory?: number;
  uptime?: number;
}

export interface ActivityNewPayload {
  id: string;
  type: 'deploy' | 'start' | 'stop' | 'error' | 'config' | 'delete';
  project: string;
  message: string;
  timestamp: string;
}

export interface ServiceChangePayload {
  type: 'postgres' | 'redis';
  status: 'running' | 'stopped' | 'error';
  version?: string;
  connectionString?: string;
}

export interface ProjectChangePayload {
  action: 'created' | 'deleted' | 'updated';
  projectId: string;
  project?: any;
}

// Event payload map
export interface EventPayloadMap {
  'metrics:update': MetricsUpdatePayload;
  'process:change': ProcessChangePayload;
  'activity:new': ActivityNewPayload;
  'service:change': ServiceChangePayload;
  'project:change': ProjectChangePayload;
}

class EventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50); // Increase for multiple WebSocket clients
  }

  // Type-safe emit
  emitEvent<T extends RealtimeEvent>(event: T, payload: EventPayloadMap[T]): void {
    this.emit(event, payload);
  }

  // Type-safe on
  onEvent<T extends RealtimeEvent>(
    event: T,
    listener: (payload: EventPayloadMap[T]) => void
  ): void {
    this.on(event, listener);
  }

  // Type-safe off
  offEvent<T extends RealtimeEvent>(
    event: T,
    listener: (payload: EventPayloadMap[T]) => void
  ): void {
    this.off(event, listener);
  }
}

// Singleton instance
export const eventBus = new EventBus();
