import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from '@/lib/api';
import { useWebSocket } from '@/contexts/WebSocketContext';

export interface ActivityItem {
  id: string;
  type: "deploy" | "start" | "stop" | "error" | "config" | "delete";
  project: string;
  message: string;
  timestamp: string;
}

export function useActivity() {
  const queryClient = useQueryClient();
  const { subscribe, on, off } = useWebSocket();

  const { data: activity, isLoading } = useQuery({
    queryKey: ['activity'],
    queryFn: async () => {
      const res = await api.get<{success: boolean, data: ActivityItem[]}>('/activity');
      return res.data.data;
    },
    staleTime: 30000,
  });

  // Subscribe to WebSocket updates
  useEffect(() => {
    subscribe(['activity']);

    const handleActivityNew = (newActivity: ActivityItem) => {
      queryClient.setQueryData(['activity'], (old: ActivityItem[] | undefined) => {
        if (!old) return [newActivity];
        return [newActivity, ...old];
      });
    };

    on('activity:new', handleActivityNew);

    return () => {
      off('activity:new', handleActivityNew);
    };
  }, [subscribe, on, off, queryClient]);

  return { activity: activity || [], isLoading };
}

export function useActivityStats(hours: number = 12) {
  const queryClient = useQueryClient();
  const { on, off } = useWebSocket();

  const { data: stats, isLoading } = useQuery({
    queryKey: ['activityStats', hours],
    queryFn: async () => {
      const res = await api.get<{success: boolean, data: number[]}>(`/activity/stats?hours=${hours}`);
      return res.data.data;
    },
    staleTime: 60000, // Refresh every minute
  });

  // Refetch stats when new activity comes in
  useEffect(() => {
    const handleActivityNew = () => {
      queryClient.invalidateQueries({ queryKey: ['activityStats'] });
    };

    on('activity:new', handleActivityNew);

    return () => {
      off('activity:new', handleActivityNew);
    };
  }, [on, off, queryClient]);

  return { stats: stats || [], isLoading };
}

export function formatTimeAgo(date: string | Date): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const seconds = Math.floor((new Date().getTime() - dateObj.getTime()) / 1000);
  
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
