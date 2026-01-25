import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ProjectsResponse, ProcessStatus } from '@/lib/api';
import { ProjectConfig, ProjectType } from '@pdcp/shared';
import { toast } from 'sonner';

// Extended Project interface with runtime status
export interface Project extends Omit<ProjectConfig, 'createdAt'> {
    status: 'running' | 'stopped' | 'failed' | 'building' | 'online';
    memory?: number;
    cpu?: number;
    uptime?: number;
    domain: string; 
    runtime: ProjectType;
    createdAt: Date;
    lastDeployed: Date;
}

export function useProjectsMock() { // Renaming to useProjects later, but keeping interface combatibility for now
    const queryClient = useQueryClient();

    // Fetch Projects
    const { data: projectsData, isLoading: projectsLoading } = useQuery({
        queryKey: ['projects'],
        queryFn: async () => {
            const res = await api.get<ProjectsResponse>('/project');
            return res.data.data;
        },
        refetchInterval: 5000,
    });

    // Fetch Processes Status
    const { data: processesData } = useQuery({
        queryKey: ['processes'],
        queryFn: async () => {
             const res = await api.get<{success: boolean, data: ProcessStatus[]}>('/process');
             return res.data.data;
        },
        refetchInterval: 2000,
    });

    // Merge Data
    const projects: Project[] = (projectsData || []).map(p => {
        const process = (processesData || []).find(proc => proc.name === p.id);
        const status = process ? (process.status === 'online' ? 'running' : process.status) : 'stopped';
        
        // Map pm2 status to UI status
        let uiStatus: Project['status'] = 'stopped';
        if (status === 'online' || status === 'running') uiStatus = 'running';
        if (status === 'errored') uiStatus = 'failed';
        if (status === 'launching') uiStatus = 'building';

        return {
            ...p,
            status: uiStatus,
            memory: process ? Math.round(process.memory / 1024 / 1024) : 0, // Bytes to MB
            cpu: process ? process.cpu : 0,
            uptime: process ? process.uptime : 0,
            domain: p.domains && p.domains.length > 0 ? p.domains[0] : `${p.name}.pdcp.local`,
            runtime: p.type,
            createdAt: new Date(p.createdAt), // Convert string to Date
            lastDeployed: new Date(p.createdAt), // Fallback (API doesn't track lastDeployed yet, assuming createdAt for now)
        };
    });

    const getProject = (id: string) => projects.find(p => p.id === id);

    // Mutations
    const startMutation = useMutation({
        mutationFn: async (id: string) => {
            await api.post(`/process/${id}/start`);
        },
        onSuccess: () => {
            toast.success('Project started');
            queryClient.invalidateQueries({ queryKey: ['processes'] });
        },
        onError: () => toast.error('Failed to start project'),
    });

    const stopMutation = useMutation({
        mutationFn: async (id: string) => {
            await api.post(`/process/${id}/stop`);
        },
        onSuccess: () => {
            toast.success('Project stopped');
            queryClient.invalidateQueries({ queryKey: ['processes'] });
        },
        onError: () => toast.error('Failed to stop project'),
    });
    
    const restartMutation = useMutation({
        mutationFn: async (id: string) => {
            await api.post(`/process/${id}/restart`);
        },
        onSuccess: () => {
            toast.success('Project restarted');
            queryClient.invalidateQueries({ queryKey: ['processes'] });
        },
        onError: () => toast.error('Failed to restart project'),
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            await api.delete(`/process/${id}`); // Using process delete for full cleanup
        },
        onSuccess: () => {
            toast.success('Project deleted');
            queryClient.invalidateQueries({ queryKey: ['projects'] });
        },
        onError: () => toast.error('Failed to delete project'),
    });

    return {
        projects,
        isLoading: projectsLoading,
        startProject: (id: string) => startMutation.mutateAsync(id),
        stopProject: (id: string) => stopMutation.mutateAsync(id),
        restartProject: (id: string) => restartMutation.mutateAsync(id),
        deleteProject: (id: string) => deleteMutation.mutateAsync(id),
        getProject,
    };
}
