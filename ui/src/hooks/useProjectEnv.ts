import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import type { EnvMutabilityInfo } from '@runway/shared';

export interface EnvVar {
  name: string;
  value: string;
}

export function useProjectEnv(projectId: string | undefined) {
    const queryClient = useQueryClient();

    // Fetch ENV variables
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

    // Fetch ENV mutability info
    const { data: mutability, isLoading: mutabilityLoading } = useQuery({
        queryKey: ['env-mutability', projectId],
        queryFn: async (): Promise<EnvMutabilityInfo> => {
            if (!projectId) return { mutable: true };
            const res = await api.get<{success: boolean, data: EnvMutabilityInfo}>(`/env/${projectId}/mutability`);
            return res.data.data;
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
        onError: (error: any) => {
            // Handle immutable ENV error
            if (error?.response?.status === 403) {
                toast.error(error.response.data?.error || 'Environment variables are locked for this project');
            } else {
                toast.error('Failed to update environment');
            }
        }
    });

    return {
        envVars,
        isLoading,
        isSaving: updateEnvMutation.isPending,
        updateEnv: (vars: Record<string, string>) => updateEnvMutation.mutateAsync(vars),
        // ENV mutability info
        mutability,
        mutabilityLoading,
        isMutable: mutability?.mutable ?? true,
    };
}
