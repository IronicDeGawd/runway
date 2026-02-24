import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { useWebSocket } from '@/contexts/WebSocketContext';

export interface Service {
  id: string;
  name: string;
  type: "postgres" | "redis";
  status: "running" | "stopped" | "error";
  version: string;
  connectionString: string;
  port: number;
  memory?: number;
}

export interface ExternalContainer {
  id: string;
  name: string;
  image: string;
  status: 'running' | 'stopped';
  ports: string;
  memory?: number;
}

export function useServices() {
  const queryClient = useQueryClient();
  const { subscribe, on, off } = useWebSocket();

  const { data: services, isLoading } = useQuery({
    queryKey: ['services'],
    queryFn: async () => {
      const res = await api.get<{success: boolean, data: Service[]}>('/services');
      return res.data.data;
    },
    staleTime: 10000,
  });

  useEffect(() => {
    subscribe(['services']);
    const handleServiceChange = () => queryClient.invalidateQueries({ queryKey: ['services'] });
    on('service:change', handleServiceChange);
    return () => off('service:change', handleServiceChange);
  }, [subscribe, on, off, queryClient]);

  const startMutation = useMutation({
    mutationFn: (type: string) => api.post(`/services/${type}/start`),
    onSuccess: () => { toast.success('Service starting...'); queryClient.invalidateQueries({ queryKey: ['services'] }); },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to start service'),
  });

  const stopMutation = useMutation({
    mutationFn: (type: string) => api.post(`/services/${type}/stop`),
    onSuccess: () => { toast.success('Service stopping...'); queryClient.invalidateQueries({ queryKey: ['services'] }); },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to stop service'),
  });

  const createMutation = useMutation({
    mutationFn: (type: string) => api.post('/services/create', { type }),
    onSuccess: () => { toast.success('Service created successfully'); queryClient.invalidateQueries({ queryKey: ['services'] }); },
    onError: (err: any) => { toast.error(err.response?.data?.error || 'Failed to create service'); throw err; },
  });

  const deleteMutation = useMutation({
    mutationFn: (type: string) => api.delete(`/services/${type}`),
    onSuccess: () => { toast.success('Service deleted successfully'); queryClient.invalidateQueries({ queryKey: ['services'] }); },
    onError: (err: any) => { toast.error(err.response?.data?.error || 'Failed to delete service'); throw err; },
  });

  const configureMutation = useMutation({
    mutationFn: ({ type, config }: { type: string; config: { port?: number; credentials?: { username?: string; password?: string; database?: string } } }) =>
      api.put(`/services/${type}/configure`, config),
    onSuccess: () => { toast.success('Service reconfigured successfully'); queryClient.invalidateQueries({ queryKey: ['services'] }); },
    onError: (err: any) => { toast.error(err.response?.data?.error || 'Failed to configure service'); throw err; },
  });

  return {
    services: services || [],
    isLoading,
    startService: (id: string) => startMutation.mutateAsync(id),
    stopService: (id: string) => stopMutation.mutateAsync(id),
    createService: (type: string) => createMutation.mutateAsync(type),
    deleteService: (id: string) => deleteMutation.mutateAsync(id),
    configureService: (type: string, config: { port?: number; credentials?: { username?: string; password?: string; database?: string } }) =>
      configureMutation.mutateAsync({ type, config }),
    isConfiguring: configureMutation.isPending,
  };
}

export function useExternalContainers() {
  const queryClient = useQueryClient();
  const { on, off } = useWebSocket();

  const { data: containers, isLoading } = useQuery({
    queryKey: ['external-containers'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: ExternalContainer[] }>('/services/external');
      return res.data.data;
    },
    staleTime: 8000,
    refetchInterval: 15000,
  });

  useEffect(() => {
    const handleChange = () => queryClient.invalidateQueries({ queryKey: ['external-containers'] });
    on('service:change', handleChange);
    return () => off('service:change', handleChange);
  }, [on, off, queryClient]);

  const startMutation = useMutation({
    mutationFn: (id: string) => api.post(`/services/external/${id}/start`),
    onSuccess: () => { toast.success('Container started'); queryClient.invalidateQueries({ queryKey: ['external-containers'] }); },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to start container'),
  });

  const stopMutation = useMutation({
    mutationFn: (id: string) => api.post(`/services/external/${id}/stop`),
    onSuccess: () => { toast.success('Container stopped'); queryClient.invalidateQueries({ queryKey: ['external-containers'] }); },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to stop container'),
  });

  const restartMutation = useMutation({
    mutationFn: (id: string) => api.post(`/services/external/${id}/restart`),
    onSuccess: () => { toast.success('Container restarted'); queryClient.invalidateQueries({ queryKey: ['external-containers'] }); },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to restart container'),
  });

  return {
    containers: containers || [],
    isLoading,
    startContainer: (id: string) => startMutation.mutateAsync(id),
    stopContainer: (id: string) => stopMutation.mutateAsync(id),
    restartContainer: (id: string) => restartMutation.mutateAsync(id),
  };
}
