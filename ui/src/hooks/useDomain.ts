import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { SystemDomain, SecurityMode, VerificationResult } from '@runway/shared';
import { useWebSocket } from '@/contexts/WebSocketContext';

// Response types for domain API
interface DomainConfigResponse {
  success: boolean;
  data: {
    domain: SystemDomain | null;
    securityMode: SecurityMode;
    serverIp: string | null;
  };
}

interface SetDomainResponse {
  success: boolean;
  message: string;
  data: {
    domain: string;
    verificationResult: VerificationResult;
    securityMode: SecurityMode;
  };
}

interface DomainStatusResponse {
  success: boolean;
  data: {
    securityMode: SecurityMode;
    domain: string | null;
    domainActive: boolean;
    serverIp: string | null;
  };
}

export function useDomain() {
  const queryClient = useQueryClient();
  const { on, off } = useWebSocket();

  // Query: Get current domain config
  const {
    data: domainConfig,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['system-domain'],
    queryFn: async () => {
      const res = await api.get<DomainConfigResponse>('/domain');
      return res.data.data;
    },
    staleTime: 30000, // 30 seconds
  });

  // Query: Get security status (lightweight)
  const { data: statusData } = useQuery({
    queryKey: ['system-domain-status'],
    queryFn: async () => {
      const res = await api.get<DomainStatusResponse>('/domain/status');
      return res.data.data;
    },
    staleTime: 60000, // 1 minute
  });

  // Mutation: Set domain
  const setDomainMutation = useMutation({
    mutationFn: async (domain: string) => {
      const res = await api.post<SetDomainResponse>('/domain', { domain });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['system-domain'] });
      queryClient.invalidateQueries({ queryKey: ['system-domain-status'] });
      if (data.success) {
        toast.success('Domain configured successfully! HTTPS is now active.');
      }
    },
    onError: (err: any) => {
      const message = err.response?.data?.message || err.response?.data?.data?.verificationResult?.error || 'Failed to configure domain';
      toast.error(message);
    },
  });

  // Mutation: Remove domain
  const removeDomainMutation = useMutation({
    mutationFn: async () => {
      const res = await api.delete('/domain');
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-domain'] });
      queryClient.invalidateQueries({ queryKey: ['system-domain-status'] });
      toast.success('Domain configuration removed');
    },
    onError: (err: any) => {
      const message = err.response?.data?.error || 'Failed to remove domain';
      toast.error(message);
    },
  });

  // Mutation: Re-verify domain
  const verifyDomainMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/domain/verify');
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['system-domain'] });
      queryClient.invalidateQueries({ queryKey: ['system-domain-status'] });
      if (data.success) {
        toast.success('Domain verified successfully');
      } else {
        toast.error(data.message || 'Domain verification failed');
      }
    },
    onError: (err: any) => {
      const message = err.response?.data?.error || 'Failed to verify domain';
      toast.error(message);
    },
  });

  // Listen for WebSocket events for domain changes
  useEffect(() => {
    const handleDomainChanged = () => {
      queryClient.invalidateQueries({ queryKey: ['system-domain'] });
      queryClient.invalidateQueries({ queryKey: ['system-domain-status'] });
    };

    const handleSecurityModeChanged = () => {
      queryClient.invalidateQueries({ queryKey: ['system-domain'] });
      queryClient.invalidateQueries({ queryKey: ['system-domain-status'] });
    };

    // Subscribe to system domain events
    on('system:domain-changed', handleDomainChanged);
    on('system:security-mode-changed', handleSecurityModeChanged);

    return () => {
      off('system:domain-changed', handleDomainChanged);
      off('system:security-mode-changed', handleSecurityModeChanged);
    };
  }, [queryClient, on, off]);

  // Helper to check if in HTTPS mode
  const isSecure = domainConfig?.securityMode === 'domain-https';

  // Helper to get the formatted server IP
  const serverIp = domainConfig?.serverIp || statusData?.serverIp || null;

  return {
    // Data
    domainConfig,
    domain: domainConfig?.domain || null,
    securityMode: domainConfig?.securityMode || 'ip-http',
    serverIp,
    isSecure,

    // Loading states
    isLoading,
    isSettingDomain: setDomainMutation.isPending,
    isRemovingDomain: removeDomainMutation.isPending,
    isVerifying: verifyDomainMutation.isPending,

    // Error
    error,

    // Actions
    setDomain: (domain: string) => setDomainMutation.mutateAsync(domain),
    removeDomain: () => removeDomainMutation.mutateAsync(),
    verifyDomain: () => verifyDomainMutation.mutateAsync(),
    refetch,
  };
}
