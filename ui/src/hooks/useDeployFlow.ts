import * as React from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export type DeployStep = "upload" | "configure" | "build" | "deploy" | "complete";

export interface DeployState {
  step: DeployStep;
  progress: number;
  logs: string[];
  error?: string;
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
  const [state, setState] = React.useState<DeployState>({
    step: "upload",
    progress: 0,
    logs: [],
  });
  const [isDeploying, setIsDeploying] = React.useState(false);
  const [deployConfig, setDeployConfig] = React.useState<{file?: File, name: string, runtime: string} | null>(null);
  const wsRef = React.useRef<WebSocket | null>(null);

  const startDeploy = React.useCallback((file?: File, config?: { runtime: string; name: string }) => {
    console.log('startDeploy called with:', { file: file?.name, config });
    if (!file || !config) {
      console.log('Missing file or config, returning');
      return;
    }
    console.log('Setting deploy config and moving to configure step');
    setDeployConfig({ file, ...config });
    
    // Move to configure step immediately - no need for fake upload progress
    setState({ step: "configure", progress: 100, logs: [] });
    console.log('State updated to configure step');
  }, []);

  const confirmConfig = React.useCallback(async () => {
    if (!deployConfig || !deployConfig.file) {
        toast.error("Missing configuration");
        return;
    }

    setIsDeploying(true);
    setState((prev) => ({ ...prev, step: "build", progress: 0, logs: ["Preparing deployment package..."], error: undefined }));

    try {
      // Convert file to base64
      const fileData = await fileToBase64(deployConfig.file);
      
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
            name: deployConfig.name,
            type: deployConfig.runtime
          }
        }));
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          if (message.type === 'deploy:progress') {
            setState(prev => ({
              ...prev,
              logs: [...prev.logs, message.message],
              progress: message.progress || prev.progress
            }));
          } else if (message.type === 'deploy:success') {
            setState(prev => ({
              ...prev,
              step: 'complete',
              progress: 100,
              logs: [...prev.logs, 'Deployment successful!', 'Project is online.']
            }));
            setIsDeploying(false); // Stop deploying state
            toast.success('Deployment successful!');
            ws.close();
            
            // Navigate to projects page after 1.5 seconds
            setTimeout(() => {
              navigate('/projects');
            }, 1500);
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
        wsRef.current = null;
        setIsDeploying(false);
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
    setState({ step: "upload", progress: 0, logs: [], error: undefined });
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

  return { state, isDeploying, startDeploy, confirmConfig, reset, setStep };
}
