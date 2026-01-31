import { useState, useEffect, useCallback, useRef } from 'react';
import { useProjects, Project } from './useProjects';

export interface Notification {
  id: string;
  title: string;
  message: string;
  time: Date;
  type: 'success' | 'warning' | 'error' | 'info';
  projectId?: string;
  read: boolean;
}

const CPU_THRESHOLD = 80; // Alert when CPU > 80%
const MEMORY_THRESHOLD_MB = 400; // Alert when memory > 400MB (approx 80% of 512MB default)

// Persist notifications in localStorage
const STORAGE_KEY = 'runway_notifications';
const MAX_NOTIFICATIONS = 50;

function loadNotifications(): Notification[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed.map((n: any) => ({
        ...n,
        time: new Date(n.time),
      }));
    }
  } catch {
    // Ignore parse errors
  }
  return [];
}

function saveNotifications(notifications: Notification[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications.slice(0, MAX_NOTIFICATIONS)));
  } catch {
    // Ignore storage errors
  }
}

export function useNotifications() {
  const { projects } = useProjects();
  const [notifications, setNotifications] = useState<Notification[]>(loadNotifications);

  // Track which alerts we've already sent to avoid spam
  const alertedProjects = useRef<Set<string>>(new Set());

  // Add a new notification
  const addNotification = useCallback((notification: Omit<Notification, 'id' | 'time' | 'read'>) => {
    const newNotification: Notification = {
      ...notification,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      time: new Date(),
      read: false,
    };

    setNotifications(prev => {
      const updated = [newNotification, ...prev].slice(0, MAX_NOTIFICATIONS);
      saveNotifications(updated);
      return updated;
    });

    return newNotification;
  }, []);

  // Mark notification as read
  const markAsRead = useCallback((id: string) => {
    setNotifications(prev => {
      const updated = prev.map(n => n.id === id ? { ...n, read: true } : n);
      saveNotifications(updated);
      return updated;
    });
  }, []);

  // Mark all as read
  const markAllAsRead = useCallback(() => {
    setNotifications(prev => {
      const updated = prev.map(n => ({ ...n, read: true }));
      saveNotifications(updated);
      return updated;
    });
  }, []);

  // Clear a notification
  const clearNotification = useCallback((id: string) => {
    setNotifications(prev => {
      const updated = prev.filter(n => n.id !== id);
      saveNotifications(updated);
      return updated;
    });
  }, []);

  // Clear all notifications
  const clearAll = useCallback(() => {
    setNotifications([]);
    saveNotifications([]);
    alertedProjects.current.clear();
  }, []);

  // Monitor projects for high CPU/memory
  useEffect(() => {
    projects.forEach((project: Project) => {
      if (project.status !== 'running') {
        // Clear alert state when project stops
        alertedProjects.current.delete(`cpu-${project.id}`);
        alertedProjects.current.delete(`memory-${project.id}`);
        return;
      }

      const cpuKey = `cpu-${project.id}`;
      const memoryKey = `memory-${project.id}`;

      // Check CPU threshold
      if (project.cpu && project.cpu > CPU_THRESHOLD) {
        if (!alertedProjects.current.has(cpuKey)) {
          alertedProjects.current.add(cpuKey);
          addNotification({
            title: 'High CPU Usage',
            message: `${project.name} is using ${project.cpu.toFixed(1)}% CPU`,
            type: 'warning',
            projectId: project.id,
          });
        }
      } else {
        // Reset alert state when CPU returns to normal
        alertedProjects.current.delete(cpuKey);
      }

      // Check memory threshold
      if (project.memory && project.memory > MEMORY_THRESHOLD_MB) {
        if (!alertedProjects.current.has(memoryKey)) {
          alertedProjects.current.add(memoryKey);
          addNotification({
            title: 'High Memory Usage',
            message: `${project.name} is using ${project.memory}MB memory`,
            type: 'warning',
            projectId: project.id,
          });
        }
      } else {
        // Reset alert state when memory returns to normal
        alertedProjects.current.delete(memoryKey);
      }
    });
  }, [projects, addNotification]);

  const unreadCount = notifications.filter(n => !n.read).length;

  return {
    notifications,
    unreadCount,
    addNotification,
    markAsRead,
    markAllAsRead,
    clearNotification,
    clearAll,
  };
}

// Format relative time
export function formatNotificationTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
