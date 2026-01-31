import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, X, Check, XCircle, RefreshCw, FileSearch, Loader2, AlertTriangle } from 'lucide-react';
import { useDeployFlow } from '@/hooks/useDeployFlow';
import { ProjectType } from '@runway/shared';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { analyzeProject as analyzeProjectApi, DeployAnalysis } from '@/lib/api';
import { WarningsList } from '@/components/runway/WarningsList';

interface UpdateProjectModalProps {
    project: {
        name: string;
        type: ProjectType;
    };
    isOpen: boolean;
    onClose: () => void;
}

export function UpdateProjectModal({ project, isOpen, onClose }: UpdateProjectModalProps) {
    const { state, isDeploying, startDeploy, confirmConfig, reset } = useDeployFlow();
    const [file, setFile] = useState<File | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const [analysis, setAnalysis] = useState<DeployAnalysis | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analyzeError, setAnalyzeError] = useState<string | null>(null);
    const [step, setStep] = useState<'upload' | 'analyze' | 'deploy'>('upload');
    const [confirmServerBuild, setConfirmServerBuild] = useState(false);

    // Reset internal state when modal opens
    React.useEffect(() => {
        if (isOpen) {
            reset();
            setFile(null);
            setAnalysis(null);
            setIsAnalyzing(false);
            setAnalyzeError(null);
            setStep('upload');
            setConfirmServerBuild(false);
        }
    }, [isOpen, reset]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        const droppedFile = e.dataTransfer.files[0];
        if (droppedFile?.name.endsWith('.zip')) {
            setFile(droppedFile);
        } else {
            toast.error('Please upload a .zip file');
        }
    }, []);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            setFile(selectedFile);
        }
    };

    const handleAnalyze = async () => {
        if (!file) return;

        setIsAnalyzing(true);
        setAnalyzeError(null);
        setStep('analyze');

        try {
            const result = await analyzeProjectApi(file, project.type);
            setAnalysis(result);

            // If no confirmation required, auto-proceed to deploy
            if (!result.requiresConfirmation) {
                await handleDeploy();
            }
        } catch (error: any) {
            const errorMsg = error.response?.data?.error || error.message || 'Analysis failed';
            setAnalyzeError(errorMsg);
            toast.error(errorMsg);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleDeploy = async () => {
        if (!file) return;

        setStep('deploy');

        // Pass all required data directly to confirmConfig
        // startDeploy sets state but state updates are async, so we can't rely on deployConfig
        // Instead, pass the file directly in configOverride
        startDeploy(file, {
            name: project.name,
            runtime: project.type,
            mode: 'update'
        });

        await confirmConfig({
            file,  // Pass file directly - don't rely on async state
            name: project.name,
            runtime: project.type,
            mode: 'update'
        });
    };

    const handleConfirmAndDeploy = async () => {
        setConfirmServerBuild(true);
        await handleDeploy();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
                    onClick={isDeploying ? undefined : onClose}
                >
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-surface-elevated rounded-card w-full max-w-lg border border-zinc-800 overflow-hidden"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-6 border-b border-zinc-800">
                            <h2 className="text-xl font-semibold text-foreground">Update {project.name}</h2>
                            {!isDeploying && (
                                <button
                                    onClick={onClose}
                                    className="p-2 -mr-2 text-zinc-400 hover:text-foreground rounded-pill hover:bg-zinc-800"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            )}
                        </div>

                        <div className="p-6">
                            {/* Upload State */}
                            {!isDeploying && step === 'upload' && (
                                <div className="space-y-6">
                                    <div
                                        onDrop={handleDrop}
                                        onDragOver={(e) => {
                                            e.preventDefault();
                                            setIsDragOver(true);
                                        }}
                                        onDragLeave={() => setIsDragOver(false)}
                                        className={cn(
                                            "border-2 border-dashed rounded-inner p-8 text-center transition-all relative",
                                            isDragOver ? "border-neon bg-neon/10" : "border-zinc-700 hover:border-zinc-600",
                                            file ? "border-status-success bg-status-success/10" : ""
                                        )}
                                    >
                                        {file ? (
                                            <div className="space-y-4">
                                                <div className="w-12 h-12 mx-auto rounded-pill bg-status-success/20 flex items-center justify-center">
                                                    <Check className="h-6 w-6 text-status-success" />
                                                </div>
                                                <div>
                                                    <p className="font-medium text-foreground">{file.name}</p>
                                                    <p className="text-sm text-zinc-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                                                </div>
                                                <button
                                                    onClick={() => setFile(null)}
                                                    className="px-3 py-1.5 rounded-pill border border-zinc-700 text-zinc-400 hover:bg-surface-overlay text-sm"
                                                >
                                                    Change File
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="space-y-4">
                                                <div className="w-12 h-12 mx-auto rounded-pill bg-zinc-800 flex items-center justify-center">
                                                    <Upload className="h-6 w-6 text-zinc-400" />
                                                </div>
                                                <div>
                                                    <p className="font-medium text-foreground">Drag and drop new source code</p>
                                                    <p className="text-sm text-zinc-500 mt-1">Supports .zip files</p>
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

                                    <div className="flex justify-end">
                                        <button
                                            onClick={handleAnalyze}
                                            disabled={!file}
                                            className="px-6 py-2 rounded-pill bg-neon text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neon/90"
                                        >
                                            Analyze & Deploy
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Analyze State */}
                            {step === 'analyze' && !isDeploying && (
                                <div className="space-y-6">
                                    {isAnalyzing ? (
                                        <div className="flex flex-col items-center justify-center py-8">
                                            <div className="w-12 h-12 rounded-pill bg-zinc-800 flex items-center justify-center mb-4">
                                                <FileSearch className="w-6 h-6 text-neon animate-pulse" />
                                            </div>
                                            <p className="text-zinc-400">Analyzing your project...</p>
                                        </div>
                                    ) : analyzeError ? (
                                        <div className="space-y-4">
                                            <div className="bg-red-500/10 border border-red-500/30 rounded-inner p-4">
                                                <div className="flex items-start gap-3">
                                                    <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                                                    <div>
                                                        <p className="font-medium text-red-400">Analysis Failed</p>
                                                        <p className="text-sm text-zinc-400 mt-1">{analyzeError}</p>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex justify-end">
                                                <button
                                                    onClick={() => { setStep('upload'); setAnalyzeError(null); }}
                                                    className="px-4 py-2 rounded-pill bg-zinc-800 text-white hover:bg-zinc-700"
                                                >
                                                    Try Again
                                                </button>
                                            </div>
                                        </div>
                                    ) : analysis && analysis.requiresConfirmation ? (
                                        <div className="space-y-6">
                                            {/* Detection Results */}
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="bg-zinc-800/50 p-3 rounded-inner border border-zinc-700">
                                                    <p className="text-zinc-500 text-xs mb-1">Project Type</p>
                                                    <p className="text-foreground font-medium capitalize text-sm">{analysis.declaredType}</p>
                                                </div>
                                                <div className="bg-zinc-800/50 p-3 rounded-inner border border-zinc-700">
                                                    <p className="text-zinc-500 text-xs mb-1">Strategy</p>
                                                    <p className="text-foreground font-medium capitalize text-sm">{analysis.strategy.replace(/-/g, ' ')}</p>
                                                </div>
                                            </div>

                                            {/* Warnings */}
                                            {analysis.warnings && analysis.warnings.length > 0 && (
                                                <WarningsList warnings={analysis.warnings} />
                                            )}

                                            {/* Confirmation Required */}
                                            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-inner p-4">
                                                <div className="flex items-start gap-3">
                                                    <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                                                    <div>
                                                        <p className="font-medium text-yellow-400">Confirmation Required</p>
                                                        <p className="text-sm text-zinc-400 mt-1">{analysis.confirmationReason || 'Server-side build requires confirmation'}</p>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex justify-end gap-3">
                                                <button
                                                    onClick={() => { setStep('upload'); setAnalysis(null); }}
                                                    className="px-4 py-2 rounded-pill border border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    onClick={handleConfirmAndDeploy}
                                                    className="px-6 py-2 rounded-pill bg-neon text-primary-foreground font-medium hover:bg-neon/90"
                                                >
                                                    Confirm & Deploy
                                                </button>
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
                            )}

                            {/* Validation/Processing State */}
                            {(isDeploying || step === 'deploy' || state.step === 'build' || state.step === 'deploy' || state.step === 'configure') && (
                                <div className="space-y-6">
                                    <div className="flex items-center justify-between">
                                        <h3 className="font-medium text-foreground">
                                            {state.step === 'build' ? 'Building...' :
                                                state.step === 'deploy' ? 'Deploying...' : 'Processing...'}
                                        </h3>
                                        <span className="text-sm text-zinc-500">{Math.round(state.progress)}%</span>
                                    </div>

                                    <div className="h-2 bg-zinc-800 rounded-pill overflow-hidden">
                                        <div
                                            className={cn(
                                                "h-full transition-all duration-300",
                                                state.error ? "bg-red-500" : "bg-neon"
                                            )}
                                            style={{ width: `${state.progress}%` }}
                                        />
                                    </div>

                                    <div className="bg-zinc-900 rounded-inner p-4 h-[200px] overflow-y-auto font-mono text-sm border border-zinc-800">
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

                                    {state.error && (
                                        <div className="flex justify-end">
                                            <button
                                                onClick={reset}
                                                className="flex items-center gap-2 px-4 py-2 rounded-pill bg-zinc-800 text-white hover:bg-zinc-700"
                                            >
                                                <RefreshCw className="w-4 h-4" />
                                                Try Again
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Success State */}
                            {state.step === 'complete' && (
                                <div className="text-center py-8 space-y-4">
                                    <div className="w-16 h-16 mx-auto rounded-pill bg-neon/20 flex items-center justify-center">
                                        <Check className="h-8 w-8 text-neon" />
                                    </div>
                                    <h3 className="text-xl font-semibold text-foreground">Update Deployed!</h3>
                                    <p className="text-zinc-500">Your project has been successfully updated.</p>
                                    <button
                                        onClick={onClose}
                                        className="mt-4 px-6 py-2 rounded-pill bg-zinc-800 text-white hover:bg-zinc-700"
                                    >
                                        Close
                                    </button>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
