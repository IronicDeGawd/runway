import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Upload, Check, ArrowRight, ArrowLeft } from 'lucide-react';
import { useDeployFlow } from '@/hooks/useDeployFlow';

type Step = 'upload' | 'configure' | 'build' | 'deploy';

const steps: { id: Step; label: string }[] = [
  { id: 'upload', label: 'Upload' },
  { id: 'configure', label: 'Configure' },
  { id: 'build', label: 'Build' },
  { id: 'deploy', label: 'Deploy' },
];

const runtimes = [
  { id: 'react', label: 'React', icon: '⚛️' },
  { id: 'nextjs', label: 'Next.js', icon: '▲' },
  { id: 'nodejs', label: 'Node.js', icon: '⬢' },
];

export default function DeployPage() {
  const navigate = useNavigate();
  const { state, startDeploy } = useDeployFlow();
  const [currentStep, setCurrentStep] = useState<Step>('upload');
  const [projectName, setProjectName] = useState('');
  const [selectedRuntime, setSelectedRuntime] = useState('react');
  const [file, setFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [buildProgress, setBuildProgress] = useState(0);
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildLogs, setBuildLogs] = useState<Array<{ timestamp: string; level: 'info' | 'warn' | 'error' | 'success'; message: string }>>([]);

  const stepIndex = steps.findIndex((s) => s.id === currentStep);

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

  const simulateBuild = async () => {
    setIsBuilding(true);
    setBuildLogs([]);
    setBuildProgress(0);

    const logMessages = [
      { delay: 300, level: 'info' as const, message: 'Installing dependencies...' },
      { delay: 800, level: 'info' as const, message: 'npm install completed' },
      { delay: 400, level: 'info' as const, message: 'Running build script...' },
      { delay: 600, level: 'info' as const, message: 'Compiling TypeScript...' },
      { delay: 500, level: 'warn' as const, message: 'Warning: unused variable detected' },
      { delay: 400, level: 'info' as const, message: 'Bundling assets...' },
      { delay: 700, level: 'info' as const, message: 'Optimizing for production...' },
      { delay: 500, level: 'success' as const, message: 'Build completed successfully!' },
    ];

    let progress = 0;
    const progressStep = 100 / logMessages.length;

    for (const log of logMessages) {
      await new Promise((resolve) => setTimeout(resolve, log.delay));
      const now = new Date();
      const timestamp = now.toTimeString().split(' ')[0];
      setBuildLogs((prev) => [...prev, { timestamp, level: log.level, message: log.message }]);
      progress += progressStep;
      setBuildProgress(Math.min(progress, 100));
    }

    setIsBuilding(false);
  };

  const nextStep = async () => {
    if (currentStep === 'upload' && file) {
      startDeploy(file, { runtime: selectedRuntime, name: projectName });
    }
    if (currentStep === 'build' && buildProgress === 0) {
      await simulateBuild();
    }
    const nextIndex = stepIndex + 1;
    if (nextIndex < steps.length) {
      setCurrentStep(steps[nextIndex].id);
    }
  };

  const prevStep = () => {
    const prevIndex = stepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(steps[prevIndex].id);
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 'upload':
        return file !== null;
      case 'configure':
        return projectName.length > 0;
      case 'build':
        return buildProgress === 100;
      case 'deploy':
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
                  className={`w-10 h-10 rounded-pill flex items-center justify-center font-medium text-sm transition-all ${
                    index < stepIndex
                      ? 'bg-neon text-primary-foreground'
                      : index === stepIndex
                      ? 'bg-neon text-primary-foreground shadow-neon-glow'
                      : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
                  }`}
                >
                  {index < stepIndex ? <Check className="h-5 w-5" /> : index + 1}
                </div>
                <span
                  className={`text-sm font-medium hidden sm:block ${
                    index <= stepIndex ? 'text-foreground' : 'text-zinc-500'
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-4 ${
                    index < stepIndex ? 'bg-neon' : 'bg-zinc-800'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step Content - Dark Container */}
        <div className="bg-surface-elevated rounded-card p-8 border border-zinc-800 min-h-[400px]">
          {currentStep === 'upload' && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-foreground">Upload Your Project</h2>
              <div
                onDrop={handleDrop}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                className={`border-2 border-dashed rounded-inner p-12 text-center transition-all relative ${
                  isDragOver
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

          {currentStep === 'configure' && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-foreground">Configure Your Project</h2>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Project Name</label>
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="my-awesome-project"
                    className="w-full px-4 py-3 rounded-element border border-zinc-700 bg-zinc-800 focus:outline-none focus:border-zinc-600 text-foreground placeholder:text-zinc-500"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Runtime</label>
                  <div className="flex gap-3">
                    {runtimes.map((runtime) => (
                      <button
                        key={runtime.id}
                        onClick={() => setSelectedRuntime(runtime.id)}
                        className={`flex-1 p-4 rounded-element border-2 transition-all ${
                          selectedRuntime === runtime.id
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

          {currentStep === 'build' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-foreground">Building Your Project</h2>
                {!isBuilding && buildProgress === 0 && (
                  <button 
                    onClick={simulateBuild} 
                    className="bg-neon text-primary-foreground font-semibold px-6 py-2 rounded-pill hover:bg-neon-hover transition-colors"
                  >
                    Start Build
                  </button>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">Build Progress</span>
                  <span className="font-medium text-foreground">{Math.round(buildProgress)}%</span>
                </div>
                <div className="h-2 bg-zinc-800 rounded-pill overflow-hidden">
                  <div 
                    className="h-full bg-neon transition-all duration-300"
                    style={{ width: `${buildProgress}%` }}
                  />
                </div>
              </div>

              <div className="bg-zinc-900 rounded-inner p-4 h-[250px] overflow-y-auto font-mono text-sm border border-zinc-800">
                {buildLogs.map((log, i) => (
                  <div key={i} className="flex gap-3 mb-1">
                    <span className="text-zinc-500 text-xs">{log.timestamp}</span>
                    <span className={
                      log.level === 'success' ? 'text-green-400' :
                      log.level === 'error' ? 'text-red-400' :
                      log.level === 'warn' ? 'text-yellow-400' :
                      'text-zinc-300'
                    }>{log.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {currentStep === 'deploy' && (
            <div className="space-y-6 text-center py-8">
              <div className="w-20 h-20 mx-auto rounded-pill bg-neon/20 flex items-center justify-center">
                <Check className="h-10 w-10 text-neon" />
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-foreground">Deployment Complete!</h2>
                <p className="text-zinc-500 mt-2">Your project is now live</p>
              </div>
              <div className="p-4 rounded-element bg-zinc-800 border border-zinc-700 inline-block">
                <span className="text-sm text-zinc-500">Your project is available at</span>
                <p className="font-medium text-foreground mt-1">
                  https://{projectName || 'my-project'}.example.com
                </p>
              </div>
              <button
                onClick={() => navigate('/projects')}
                className="bg-neon text-primary-foreground font-semibold px-8 py-3 rounded-pill hover:bg-neon-hover transition-colors shadow-neon-glow"
              >
                View All Projects
              </button>
            </div>
          )}
        </div>

        {/* Navigation Buttons */}
        {currentStep !== 'deploy' && (
          <div className="flex justify-between">
            <button
              onClick={prevStep}
              disabled={stepIndex === 0}
              className={`flex items-center space-x-2 px-5 py-3 rounded-pill border border-zinc-700 text-foreground transition-colors ${
                stepIndex === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-surface-elevated'
              }`}
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back</span>
            </button>
            <button
              onClick={nextStep}
              disabled={!canProceed() || isBuilding}
              className={`flex items-center space-x-2 px-6 py-3 rounded-pill font-semibold transition-colors ${
                canProceed() && !isBuilding
                  ? 'bg-neon text-primary-foreground hover:bg-neon-hover'
                  : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
              }`}
            >
              <span>{currentStep === 'build' && buildProgress === 0 ? 'Skip to Deploy' : 'Continue'}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
