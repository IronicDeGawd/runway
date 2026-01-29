import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from 'sonner';

export interface EnvVar {
  name: string;
  value: string;
}

export function useProjectEnv(projectId: string | undefined) {
    const queryClient = useQueryClient();

    const { data: envVars, isLoading } = useQuery({
        queryKey: ['env', projectId],
        queryFn: async () => {
             if (!projectId) return [];
             const res = await api.get<{success: boolean, data: Record<string, string>}>(`/env/${projectId}`);
             // Convert object to array
             return Object.entries(res.data.data).map(([name, value]) => ({ name, value }));
        },
        enabled: !!projectId,
    });

    const updateEnvMutation = useMutation({
        mutationFn: async (vars: Record<string, string>) => {
            if (!projectId) return;
            const response = await api.post(`/env/${projectId}`, { env: vars });
            return response.data;
        },
        onMutate: () => {
            toast.info('Saving environment variables...');
        },
        onSuccess: (data) => {
            toast.success('Environment updated successfully');
            if (data.actionMessage) {
              toast.warning(data.actionMessage, { duration: 5000 });
            }
            queryClient.invalidateQueries({ queryKey: ['env', projectId] });
        },
        onError: () => toast.error('Failed to update environment')
    });

    return {
        envVars,
        isLoading,
        isSaving: updateEnvMutation.isPending,
        updateEnv: (vars: Record<string, string>) => updateEnvMutation.mutateAsync(vars)
    };
}
