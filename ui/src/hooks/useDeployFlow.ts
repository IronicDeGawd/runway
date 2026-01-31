import * as React from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { analyzeProject as analyzeProjectApi, DeployAnalysis, DeployWarning } from "@/lib/api";

export type DeployStep = "upload" | "configure" | "analyze" | "build" | "deploy" | "complete";

export interface DeployState {
  step: DeployStep;
  progress: number;
  logs: string[];
  error?: string;
  deployedProject?: any;
  // Analysis state
  analysis?: DeployAnalysis;
  isAnalyzing?: boolean;
  requiresConfirmation?: boolean;
  confirmationReason?: string;
  confirmServerBuild?: boolean;
}

// Helper to convert File to base64
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix (data:application/zip;base64,)
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
  });
};

export function useDeployFlow() {
  const navigate = useNavigate();
  const [state, setState] = React.useState<DeployState>({
    step: "upload",
    progress: 0,
    logs: [],
  });
  const [isDeploying, setIsDeploying] = React.useState(false);
  const [deployConfig, setDeployConfig] = React.useState<{file?: File, name: string, runtime: string, mode?: 'create' | 'update'} | null>(null);
  const wsRef = React.useRef<WebSocket | null>(null);

  const startDeploy = React.useCallback((file?: File, config?: { runtime: string; name: string; mode?: 'create' | 'update' }) => {
    console.log('startDeploy called with:', { file: file?.name, config });
    if (!file || !config) {
      console.log('Missing file or config, returning');
      return;
    }
    console.log('Setting deploy config and moving to configure step');
    setDeployConfig({ file, ...config });

    // Move to configure step immediately - no need for fake upload progress
    setState({ step: "configure", progress: 100, logs: [], analysis: undefined, requiresConfirmation: false });
    console.log('State updated to configure step');
  }, []);

  // Analyze the project before deployment
  const analyzeProject = React.useCallback(async (file: File, declaredType?: string): Promise<DeployAnalysis | null> => {
    setState(prev => ({ ...prev, isAnalyzing: true, step: 'analyze', progress: 0, logs: ['Analyzing project...'] }));

    try {
      const analysis = await analyzeProjectApi(file, declaredType);

      setState(prev => ({
        ...prev,
        analysis,
        isAnalyzing: false,
        progress: 100,
        logs: [...prev.logs, 'Analysis complete'],
        requiresConfirmation: analysis.requiresConfirmation,
        confirmationReason: analysis.confirmationReason,
      }));

      return analysis;
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || error.message || 'Analysis failed';
      setState(prev => ({
        ...prev,
        isAnalyzing: false,
        error: errorMsg,
        logs: [...prev.logs, `Error: ${errorMsg}`],
      }));
      toast.error(errorMsg);
      return null;
    }
  }, []);

  // User confirms they want to proceed with server-side build
  const confirmBuild = React.useCallback(() => {
    setState(prev => ({
      ...prev,
      requiresConfirmation: false,
      confirmServerBuild: true,
    }));
  }, []);

  const confirmConfig = React.useCallback(async (configOverride?: { file?: File, name?: string, runtime?: string, mode?: 'create' | 'update' }) => {
    const finalConfig = { ...deployConfig, ...configOverride };
    
    if (!finalConfig || !finalConfig.file || !finalConfig.name || !finalConfig.runtime) {
        toast.error("Missing configuration");
        console.error("Missing configuration:", finalConfig);
        return;
    }

    setIsDeploying(true);
    setState((prev) => ({ ...prev, step: "build", progress: 0, logs: ["Preparing deployment package..."], error: undefined }));

    try {
      // Convert file to base64
      const fileData = await fileToBase64(finalConfig.file);
      
      // Generate unique deployment ID (fallback for non-secure contexts)
      const deploymentId =
        globalThis.crypto?.randomUUID?.() ??
        `${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;

      // Connect to WebSocket
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Not authenticated');
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/realtime?token=${token}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        // Send deployment request
        ws.send(JSON.stringify({
          action: 'deploy',
          payload: {
            fileData,
            name: finalConfig.name,
            type: finalConfig.runtime,
            deploymentId,
            mode: finalConfig.mode,
            confirmServerBuild: state.confirmServerBuild || false,
          }
        }));
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('WS Message received:', message);
          
          if (message.type === 'deploy:progress') {
            setState(prev => ({
              ...prev,
              logs: [...prev.logs, message.message],
              progress: message.progress || prev.progress
            }));
          } else if (message.type === 'deploy:success') {
            console.log('Deploy success received, updating state to complete');
            setState(prev => ({
              ...prev,
              step: 'complete',
              progress: 100,
              logs: [...prev.logs, 'Deployment successful!', 'Project is online.'],
              deployedProject: message.project
            }));
            setIsDeploying(false); // Stop deploying state
            toast.success('Deployment successful!');
            ws.close();
            
            // Navigate to projects page after 1.5 seconds
            // setTimeout(() => {
            //   navigate('/projects');
            // }, 1500);
          } else if (message.type === 'deploy:error') {
            setState(prev => ({
              ...prev,
              error: message.error,
              logs: [...prev.logs, `Error: ${message.error}`]
            }));
            setIsDeploying(false); // Stop deploying state
            toast.error(message.error);
            ws.close();
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setState(prev => ({
          ...prev,
          error: 'Connection error',
          logs: [...prev.logs, 'Error: Connection failed']
        }));
        toast.error('Connection error');
        setIsDeploying(false);
      };

      ws.onclose = () => {
        console.log('WebSocket closed. Was deploying?', isDeploying);
        // If we were deploying and didn't get a success/error, poll for status
        if (state.step !== 'complete' && !state.error) {
           console.log('Unexpected disconnect, polling status...');
           const pollInterval = setInterval(async () => {
             try {
               const response = await fetch(`/api/project/status/${deploymentId}`, {
                 headers: { 'Authorization': `Bearer ${token}` }
               });
               
               if (response.ok) {
                 const json = await response.json();
                 const status = json.data;
                 
                 if (status) {
                    if (status.status === 'success') {
                      clearInterval(pollInterval);
                      setState(prev => ({
                        ...prev,
                        step: 'complete',
                        progress: 100,
                        logs: [...prev.logs, ...status.logs, 'Deployment successful!', 'Project is online.'],
                        deployedProject: status.project
                      }));
                      setIsDeploying(false);
                      toast.success('Deployment successful!');
                    } else if (status.status === 'failed') {
                      clearInterval(pollInterval);
                       setState(prev => ({
                        ...prev,
                        error: status.error || 'Deployment failed',
                        logs: [...prev.logs, ...status.logs, `Error: ${status.error}`]
                      }));
                      setIsDeploying(false);
                      toast.error(status.error || 'Deployment failed');
                    } else {
                       // Update logs/progress
                       setState(prev => ({
                        ...prev,
                        progress: status.progress || prev.progress,
                        logs: [...new Set([...prev.logs, ...status.logs])] // Simple de-dupe
                      }));
                    }
                 }
               } else if (response.status === 404) {
                 // Deployment not found - maybe didn't start?
                 // Retry a few times then fail? For now, keep polling for 30s?
               }
             } catch (e) {
               console.error('Polling error', e);
             }
           }, 2000);

           // Stop polling after 60s
           setTimeout(() => clearInterval(pollInterval), 60000);
        }
        
        wsRef.current = null;
        // Don't set isDeploying(false) here immediately if we are polling
      };

    } catch (error: any) {
      setState(prev => ({ 
        ...prev, 
        error: error.message || "Deployment failed", 
        logs: [...prev.logs, `Error: ${error.message || "Deployment failed"}`] 
      }));
      toast.error(error.message || "Deployment failed");
      setIsDeploying(false);
    }
  }, [deployConfig]);

  const reset = React.useCallback(() => {
    // Close WebSocket if still open
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setState({
      step: "upload",
      progress: 0,
      logs: [],
      error: undefined,
      analysis: undefined,
      isAnalyzing: false,
      requiresConfirmation: false,
      confirmationReason: undefined,
      confirmServerBuild: false,
    });
    setIsDeploying(false);
    setDeployConfig(null);
  }, []);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const setStep = React.useCallback((step: DeployStep) => {
    setState((prev) => ({ ...prev, step }));
  }, []);

  return { state, isDeploying, startDeploy, confirmConfig, reset, setStep, analyzeProject, confirmBuild };
}
