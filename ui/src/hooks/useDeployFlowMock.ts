import * as React from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";

export type DeployStep = "upload" | "configure" | "build" | "deploy" | "complete";

export interface DeployState {
  step: DeployStep;
  progress: number;
  logs: string[];
  error?: string;
}

export function useDeployFlowMock() {
  const [state, setState] = React.useState<DeployState>({
    step: "upload",
    progress: 0,
    logs: [],
  });
  const [isDeploying, setIsDeploying] = React.useState(false);
  const [deployConfig, setDeployConfig] = React.useState<{file?: File, name: string, runtime: string} | null>(null);

  const startDeploy = React.useCallback((file?: File, config?: { runtime: string; name: string }) => {
    if (!file || !config) return;
    setDeployConfig({ file, ...config });
    
    // Simulate upload progress
    setState({ step: "upload", progress: 0, logs: [] });
    let progress = 0;
    const uploadInterval = setInterval(() => {
      progress += 10;
      if (progress >= 100) {
        clearInterval(uploadInterval);
        setState((prev) => ({ ...prev, step: "configure", progress: 100 }));
      } else {
        setState((prev) => ({ ...prev, progress }));
      }
    }, 100);
    
    // Cleanup not returned effectively here but manageable
  }, []);

  const confirmConfig = React.useCallback(async () => {
    if (!deployConfig || !deployConfig.file) {
        toast.error("Missing configuration");
        return;
    }

    setIsDeploying(true);
    setState((prev) => ({ ...prev, step: "build", progress: 0, logs: ["Preparing deployment package..."] }));

    const formData = new FormData();
    formData.append('file', deployConfig.file);
    formData.append('name', deployConfig.name);
    formData.append('type', deployConfig.runtime);

    try {
        // Fake build progress while waiting
        const progressInterval = setInterval(() => {
            setState(prev => {
                if (prev.progress < 90) return { ...prev, progress: prev.progress + 5 };
                return prev;
            });
        }, 500);

        setState(prev => ({ ...prev, logs: [...prev.logs, "Uploading and building project...", "This may take a minute..."] }));

        // Actual API call
        await api.post('/project/deploy', formData, {
             headers: { 'Content-Type': 'multipart/form-data' }
        });

        clearInterval(progressInterval);
        setState((prev) => ({ 
            ...prev, 
            step: "complete", 
            progress: 100, 
            logs: [...prev.logs, "Deployment successful!", "Project is online."] 
        }));
        toast.success("Deployment successful!");

    } catch (error: any) {
        setState(prev => ({ 
            ...prev, 
            error: error.response?.data?.error || "Deployment failed", 
            logs: [...prev.logs, `Error: ${error.response?.data?.error || "Deployment failed"}`] 
        }));
        toast.error(error.response?.data?.error || "Deployment failed");
    } finally {
        setIsDeploying(false);
    }
  }, [deployConfig]);

  const reset = React.useCallback(() => {
    setState({ step: "upload", progress: 0, logs: [] });
    setIsDeploying(false);
    setDeployConfig(null);
  }, []);

  const setStep = React.useCallback((step: DeployStep) => {
    setState((prev) => ({ ...prev, step }));
  }, []);

  return { state, isDeploying, startDeploy, confirmConfig, reset, setStep };
}
