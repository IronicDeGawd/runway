import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Upload, Check, ArrowRight, ArrowLeft, RefreshCw, XCircle, Loader2, FileSearch, AlertTriangle, Globe } from 'lucide-react';
import { useDeployFlow } from '@/hooks/useDeployFlow';
import { useProjects } from '@/hooks/useProjects';
import { RiReactjsFill, RiNextjsFill } from "react-icons/ri";
import { FaNodeJs } from "react-icons/fa";
import { getProjectUrl } from '@/utils/url';
import { WarningsList } from '@/components/runway/WarningsList';

const steps = [
  { id: 'upload', label: 'Upload' },
  { id: 'configure', label: 'Configure' },
  { id: 'analyze', label: 'Analyze' },
  { id: 'build', label: 'Build' },
  { id: 'deploy', label: 'Deploy' },
] as const;

const runtimes = [
  { id: 'react', label: 'React', icon: <RiReactjsFill className="w-8 h-8" /> },
  { id: 'next', label: 'Next.js', icon: <RiNextjsFill className="w-8 h-8" /> },
  { id: 'node', label: 'Node.js', icon: <FaNodeJs className="w-8 h-8" /> },
  { id: 'static', label: 'Static', icon: <Globe className="w-8 h-8" /> },
];

export default function DeployPage() {
  const navigate = useNavigate();
  // Destructure state and handlers from the hook
  const { state, isDeploying, startDeploy, confirmConfig, reset, setStep, analyzeProject, confirmBuild } = useDeployFlow();
  const { projects } = useProjects();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // Local state for form inputs
  const [projectName, setProjectName] = useState('');
  const [selectedRuntime, setSelectedRuntime] = useState('react');
  const [file, setFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Derive current step index from hook state
  const stepIndex = steps.findIndex((s) => s.id === state.step);

  // Sync hook state with local form if needed, or just drive UI from hook
  // We need to keep input state local until submission

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile?.name.endsWith('.zip')) {
      setFile(droppedFile);
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  const nextStep = async () => {
    setValidationError(null);
    if (state.step === 'upload' && file) {
      // Initialize deployment flow with file and default config
      startDeploy(file, { runtime: selectedRuntime, name: projectName, mode: 'create' });
    } else if (state.step === 'configure') {
      if (!projectName.trim()) {
        setValidationError('Project name is required');
        return;
      }

      // Check for duplicate name
      const exists = projects.some(p => p.name.toLowerCase() === projectName.trim().toLowerCase());
      if (exists) {
        setValidationError('Project name already exists. Go to Project Details to update.');
        return;
      }

      // Analyze the project first
      if (file) {
        await analyzeProject(file, selectedRuntime);
      }
    } else if (state.step === 'analyze') {
      // If confirmation is required and not yet confirmed, show dialog
      if (state.requiresConfirmation && !state.confirmServerBuild) {
        setShowConfirmDialog(true);
        return;
      }
      // Proceed to build
      await handleConfigureContinue();
    }
  };

  const prevStep = () => {
    if (state.step === 'configure') {
      setStep('upload');
      setFile(null); // Optional: clear file if going back
    } else if (state.step === 'analyze') {
      setStep('configure');
    } else if (state.step === 'build') {
      // Warn/Prevent going back during build? For now allow reset
      if (confirm('Cancel deployment?')) {
        reset();
      }
    }
  };

  const handleConfigureContinue = async () => {
    if (!file) return;
    // Update config in hook before confirming (optional now, but good for consistency)
    startDeploy(file, { runtime: selectedRuntime, name: projectName, mode: 'create' });
    // Pass config directly to avoid race condition with state update
    await confirmConfig({ name: projectName, runtime: selectedRuntime, mode: 'create' });
  };

  const canProceed = () => {
    switch (state.step) {
      case 'upload':
        return file !== null;
      case 'configure':
        return projectName.length > 0;
      case 'analyze':
        return state.analysis && !state.isAnalyzing;
      case 'build':
        return false; // Auto-proceeds or waits
      case 'deploy':
        return true;
      case 'complete':
        return true;
      default:
        return false;
    }
  };

  return (
    <DashboardLayout>
      <div className="px-8 pb-8 pt-2 space-y-8 animate-fade-in">
        {/* Header */}
        <div className="flex items-center space-x-4">
          <button onClick={() => navigate('/projects')} className="p-2 rounded-pill bg-zinc-900 border border-zinc-800 hover:bg-surface-overlay">
            <ArrowLeft className="w-5 h-5 text-zinc-400" />
          </button>
          <h1 className="text-4xl font-light text-foreground">Deploy New Project</h1>
        </div>

        {/* Progress Stepper */}
        <div className="flex items-center justify-between mb-8">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center flex-1">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-pill flex items-center justify-center font-medium text-sm transition-all ${index < stepIndex
                    ? 'bg-neon text-primary-foreground'
                    : index === stepIndex
                      ? 'bg-neon text-primary-foreground shadow-neon-glow'
                      : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
                    }`}
                >
                  {index < stepIndex ? <Check className="h-5 w-5" /> : index + 1}
                </div>
                <span
                  className={`text-sm font-medium hidden sm:block ${index <= stepIndex ? 'text-foreground' : 'text-zinc-500'
                    }`}
                >
                  {step.label}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-4 ${index < stepIndex ? 'bg-neon' : 'bg-zinc-800'
                    }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step Content - Dark Container */}
        <div className="bg-surface-elevated rounded-card p-8 border border-zinc-800 min-h-[400px]">
          {state.step === 'upload' && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-foreground">Upload Your Project</h2>
              <div
                onDrop={handleDrop}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                className={`border-2 border-dashed rounded-inner p-12 text-center transition-all relative ${isDragOver
                  ? 'border-neon bg-neon/10'
                  : file
                    ? 'border-status-success bg-status-success/10'
                    : 'border-zinc-700 hover:border-zinc-600'
                  }`}
              >
                {file ? (
                  <div className="space-y-2">
                    <div className="w-16 h-16 mx-auto rounded-pill bg-status-success/20 flex items-center justify-center">
                      <Check className="h-8 w-8 text-status-success" />
                    </div>
                    <p className="font-medium text-foreground">{file.name}</p>
                    <p className="text-sm text-zinc-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                    <button
                      onClick={() => setFile(null)}
                      className="mt-4 px-4 py-2 rounded-pill border border-zinc-700 text-zinc-400 hover:bg-surface-overlay text-sm"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="w-16 h-16 mx-auto rounded-pill bg-zinc-800 flex items-center justify-center">
                      <Upload className="h-8 w-8 text-zinc-400" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">
                        Drag and drop your .zip file here
                      </p>
                      <p className="text-sm text-zinc-500 mt-1">or click to browse</p>
                    </div>
                    <input
                      type="file"
                      accept=".zip"
                      onChange={handleFileChange}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {state.step === 'configure' && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-foreground">Configure Your Project</h2>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Project Name</label>
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => {
                      setProjectName(e.target.value);
                      if (e.target.value.trim()) setValidationError(null);
                    }}
                    placeholder="my-awesome-project"
                    className={`w-full px-4 py-3 rounded-element border bg-zinc-800 focus:outline-none focus:border-zinc-600 text-foreground placeholder:text-zinc-500 ${validationError ? 'border-red-500' : 'border-zinc-700'
                      }`}
                  />
                  {validationError && (
                    <p className="text-sm text-red-500">{validationError}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Runtime</label>
                  <div className="flex gap-3">
                    {runtimes.map((runtime) => (
                      <button
                        key={runtime.id}
                        onClick={() => setSelectedRuntime(runtime.id)}
                        className={`flex-1 p-4 rounded-element border-2 transition-all ${selectedRuntime === runtime.id
                          ? 'border-neon bg-neon/10'
                          : 'border-zinc-700 hover:border-zinc-600'
                          }`}
                      >
                        <span className="text-2xl mb-2 block">{runtime.icon}</span>
                        <span className="font-medium text-foreground">{runtime.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {state.step === 'analyze' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-foreground">Project Analysis</h2>
                {state.isAnalyzing && (
                  <div className="flex items-center gap-2 text-zinc-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Analyzing...</span>
                  </div>
                )}
              </div>

              {state.isAnalyzing ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="w-16 h-16 rounded-pill bg-zinc-800 flex items-center justify-center mb-4">
                    <FileSearch className="w-8 h-8 text-neon animate-pulse" />
                  </div>
                  <p className="text-zinc-400">Analyzing your project...</p>
                </div>
              ) : state.analysis ? (
                <div className="space-y-6">
                  {/* Detection Results */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-zinc-800/50 p-4 rounded-inner border border-zinc-700">
                      <p className="text-zinc-500 text-sm mb-1">Project Type</p>
                      <p className="text-foreground font-medium capitalize">{state.analysis.declaredType}</p>
                    </div>
                    <div className="bg-zinc-800/50 p-4 rounded-inner border border-zinc-700">
                      <p className="text-zinc-500 text-sm mb-1">Strategy</p>
                      <p className="text-foreground font-medium capitalize">{state.analysis.strategy.replace(/-/g, ' ')}</p>
                    </div>
                    <div className="bg-zinc-800/50 p-4 rounded-inner border border-zinc-700">
                      <p className="text-zinc-500 text-sm mb-1">Build Required</p>
                      <p className={`font-medium ${state.analysis.requiresBuild ? 'text-yellow-400' : 'text-status-success'}`}>
                        {state.analysis.requiresBuild ? 'Yes' : 'No'}
                      </p>
                    </div>
                    <div className="bg-zinc-800/50 p-4 rounded-inner border border-zinc-700">
                      <p className="text-zinc-500 text-sm mb-1">Serve Method</p>
                      <p className="text-foreground font-medium">{state.analysis.serveMethod === 'caddy-static' ? 'Static Files' : 'PM2 Proxy'}</p>
                    </div>
                  </div>

                  {/* Warnings */}
                  {state.analysis.warnings && state.analysis.warnings.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-sm font-medium text-zinc-400">Warnings & Information</h3>
                      <WarningsList warnings={state.analysis.warnings} />
                    </div>
                  )}

                  {/* Confirmation Required Notice */}
                  {state.requiresConfirmation && !state.confirmServerBuild && (
                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-inner p-4">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium text-yellow-400">Confirmation Required</p>
                          <p className="text-sm text-zinc-400 mt-1">{state.confirmationReason || 'Server-side build requires confirmation'}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Confirmed Notice */}
                  {state.confirmServerBuild && (
                    <div className="bg-status-success/10 border border-status-success/30 rounded-inner p-4">
                      <div className="flex items-center gap-3">
                        <Check className="w-5 h-5 text-status-success" />
                        <p className="text-status-success font-medium">Server-side build confirmed - ready to proceed</p>
                      </div>
                    </div>
                  )}
                </div>
              ) : state.error ? (
                <div className="bg-red-500/10 border border-red-500/30 rounded-inner p-4">
                  <div className="flex items-start gap-3">
                    <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-red-400">Analysis Failed</p>
                      <p className="text-sm text-zinc-400 mt-1">{state.error}</p>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {(state.step === 'build' || state.step === 'deploy') && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-foreground">
                  {state.step === 'build' ? 'Building Your Project' : 'Deploying...'}
                </h2>
                {state.error && (
                  <button
                    onClick={reset}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-pill bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Retry</span>
                  </button>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">Progress</span>
                  <span className="font-medium text-foreground">{Math.round(state.progress)}%</span>
                </div>
                <div className="h-2 bg-zinc-800 rounded-pill overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${state.error ? 'bg-red-500' : 'bg-neon'}`}
                    style={{ width: `${state.progress}%` }}
                  />
                </div>
              </div>

              <div className="bg-zinc-900 rounded-inner p-4 h-[250px] overflow-y-auto font-mono text-sm border border-zinc-800">
                {state.logs.map((log, i) => (
                  <div key={i} className="flex gap-3 mb-1">
                    <span className="text-zinc-500 text-xs">{new Date().toLocaleTimeString()}</span>
                    <span className="text-zinc-300">{log}</span>
                  </div>
                ))}
                {state.error && (
                  <div className="flex gap-3 mb-1">
                    <span className="text-red-400 flex items-center gap-2">
                      <XCircle className="w-4 h-4" />
                      Error: {state.error}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {state.step === 'complete' && (
            <div className="space-y-6 text-center py-8">
              <div className="w-20 h-20 mx-auto rounded-pill bg-neon/20 flex items-center justify-center">
                <Check className="h-10 w-10 text-neon" />
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-foreground">Deployment Complete!</h2>
                <p className="text-zinc-500 mt-2">Your project is now live</p>
                <div className="flex flex-col items-center gap-6">
                  <div className="p-4 rounded-element bg-zinc-800 border border-zinc-700 w-full max-w-md">
                    <span className="text-sm text-zinc-500">Your project is available at</span>
                    <a
                      href={getProjectUrl(state.deployedProject || { name: projectName })}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-neon mt-1 block hover:underline break-all"
                    >
                      {getProjectUrl(state.deployedProject || { name: projectName })}
                    </a>
                  </div>
                  <button
                    onClick={() => navigate('/projects')}
                    className="bg-neon text-primary-foreground font-semibold px-8 py-3 rounded-pill hover:bg-neon-hover transition-colors shadow-neon-glow"
                  >
                    View All Projects
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Navigation Buttons */}
        {(state.step === 'upload' || state.step === 'configure' || state.step === 'analyze') && (
          <div className="flex justify-between">
            <button
              onClick={prevStep}
              disabled={state.step === 'upload'}
              className={`flex items-center space-x-2 px-5 py-3 rounded-pill border border-zinc-700 text-foreground transition-colors ${state.step === 'upload' ? 'opacity-50 cursor-not-allowed' : 'hover:bg-surface-elevated'
                }`}
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back</span>
            </button>
            <button
              onClick={nextStep}
              disabled={!canProceed() || isDeploying || state.isAnalyzing}
              className={`flex items-center space-x-2 px-6 py-3 rounded-pill font-semibold transition-colors ${canProceed() && !isDeploying && !state.isAnalyzing
                ? 'bg-neon text-primary-foreground hover:bg-neon-hover'
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                }`}
            >
              {state.isAnalyzing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <span>
                    {state.step === 'configure' ? 'Analyze Project' :
                     state.step === 'analyze' ? 'Start Deployment' : 'Continue'}
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        )}
      </div>
      {/* Server Build Confirmation Dialog */}
      {showConfirmDialog && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowConfirmDialog(false)}
        >
          <div
            className="bg-zinc-900 rounded-card border border-zinc-800 p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 rounded-pill bg-yellow-500/20 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-6 h-6 text-yellow-500" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-foreground">Server-Side Build Required</h3>
                <p className="text-zinc-400 mt-2">
                  {state.confirmationReason || 'This deployment requires building on the server, which may consume significant server resources.'}
                </p>
              </div>
            </div>

            <div className="bg-zinc-800/50 rounded-inner p-4 mb-6 border border-zinc-700">
              <p className="text-sm text-zinc-300">
                Server builds are necessary when deploying source code without pre-built artifacts. The build process will run on the deployment server.
              </p>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowConfirmDialog(false);
                  setStep('configure');
                }}
                className="px-4 py-2 rounded-pill border border-zinc-700 text-zinc-400 hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  confirmBuild();
                  setShowConfirmDialog(false);
                  await handleConfigureContinue();
                }}
                className="px-4 py-2 rounded-pill bg-neon text-primary-foreground hover:bg-neon-hover font-medium transition-colors"
              >
                Confirm & Deploy
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout >
  );
}

