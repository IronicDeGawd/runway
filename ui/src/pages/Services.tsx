import { useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useServices, useExternalContainers, Service } from '@/hooks/useServices';
import { Database, Server, Copy, Eye, EyeOff, Plus, Play, Square, ArrowLeft, Filter, X, Settings, Box, Info, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { copyWithToast } from '@/lib/clipboard';
import { motion, AnimatePresence } from 'framer-motion';

function ConfigureServiceModal({
  service,
  isOpen,
  onClose,
  onConfigure
}: {
  service: Service | null;
  isOpen: boolean;
  onClose: () => void;
  onConfigure: (type: string, config: { port?: number; credentials?: { username?: string; password?: string; database?: string } }) => Promise<void>;
}) {
  const [port, setPort] = useState(service?.port || 5432);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [database, setDatabase] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset form when service changes
  useState(() => {
    if (service) {
      setPort(service.port);
      setUsername('');
      setPassword('');
      setDatabase('');
    }
  });

  if (!service) return null;

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);
      const config: { port?: number; credentials?: { username?: string; password?: string; database?: string } } = {};

      if (port !== service.port) {
        config.port = port;
      }

      if (service.type === 'postgres' && (username || password || database)) {
        config.credentials = {};
        if (username) config.credentials.username = username;
        if (password) config.credentials.password = password;
        if (database) config.credentials.database = database;
      }

      await onConfigure(service.type, config);
      onClose();
    } catch (error) {
      // Error handled by hook
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-surface-elevated border border-zinc-800 rounded-card w-full max-w-md overflow-hidden shadow-xl"
          >
            <div className="flex items-center justify-between p-6 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <Settings className="w-5 h-5 text-zinc-400" />
                <h2 className="text-xl font-semibold text-foreground">Configure {service.name}</h2>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-zinc-400 hover:text-foreground rounded-pill hover:bg-surface-overlay"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Port</label>
                <input
                  type="number"
                  value={port}
                  onChange={(e) => setPort(parseInt(e.target.value) || service.port)}
                  min={1024}
                  max={65535}
                  className="w-full px-3 py-2 rounded-element bg-zinc-900 border border-zinc-700 text-foreground focus:outline-none focus:border-zinc-500"
                />
              </div>

              {service.type === 'postgres' && (
                <>
                  <div className="pt-2 border-t border-zinc-800">
                    <p className="text-sm text-zinc-500 mb-4">
                      Leave credentials blank to keep current values
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">Username</label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="runway_user"
                      className="w-full px-3 py-2 rounded-element bg-zinc-900 border border-zinc-700 text-foreground focus:outline-none focus:border-zinc-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">Password</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3 py-2 rounded-element bg-zinc-900 border border-zinc-700 text-foreground focus:outline-none focus:border-zinc-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">Database Name</label>
                    <input
                      type="text"
                      value={database}
                      onChange={(e) => setDatabase(e.target.value)}
                      placeholder="runway_db"
                      className="w-full px-3 py-2 rounded-element bg-zinc-900 border border-zinc-700 text-foreground focus:outline-none focus:border-zinc-500"
                    />
                  </div>
                </>
              )}

              <div className="p-3 rounded-element bg-yellow-500/10 border border-yellow-500/20">
                <p className="text-sm text-yellow-400">
                  Warning: Changing configuration will restart the service. Existing connections will be dropped.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-6 border-t border-zinc-800 bg-surface-muted/50">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex items-center gap-2 px-6 py-2 text-sm font-semibold text-primary-foreground bg-neon rounded-pill hover:bg-neon-hover disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Applying...
                  </>
                ) : (
                  'Apply Changes'
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function CreateServiceModal({
  isOpen,
  onClose,
  onCreate
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (type: string) => Promise<void>;
}) {
  const [selectedType, setSelectedType] = useState<string>('postgres');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);
      await onCreate(selectedType);
      onClose();
    } catch (error) {
      // Error handled by hook
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-surface-elevated border border-zinc-800 rounded-card w-full max-w-md overflow-hidden shadow-xl"
          >
            <div className="flex items-center justify-between p-6 border-b border-zinc-800">
              <h2 className="text-xl font-semibold text-foreground">Create New Service</h2>
              <button
                onClick={onClose}
                className="p-2 text-zinc-400 hover:text-foreground rounded-pill hover:bg-surface-overlay"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="space-y-4">
                <label className="text-sm font-medium text-zinc-400">Select Service Type</label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => setSelectedType('postgres')}
                    className={cn(
                      "flex flex-col items-center gap-3 p-4 rounded-element border-2 transition-all",
                      selectedType === 'postgres'
                        ? "border-neon bg-neon/10"
                        : "border-zinc-700 hover:border-zinc-600 bg-surface-muted"
                    )}
                  >
                    <div className="p-3 rounded-full bg-blue-500/20 text-blue-400">
                      <Database className="w-6 h-6" />
                    </div>
                    <span className="font-medium text-foreground">PostgreSQL</span>
                  </button>

                  <button
                    onClick={() => setSelectedType('redis')}
                    className={cn(
                      "flex flex-col items-center gap-3 p-4 rounded-element border-2 transition-all",
                      selectedType === 'redis'
                        ? "border-neon bg-neon/10"
                        : "border-zinc-700 hover:border-zinc-600 bg-surface-muted"
                    )}
                  >
                    <div className="p-3 rounded-full bg-red-500/20 text-red-400">
                      <Server className="w-6 h-6" />
                    </div>
                    <span className="font-medium text-foreground">Redis</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-6 border-t border-zinc-800 bg-surface-muted/50">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                data-testid="create-service-submit"
                className="flex items-center gap-2 px-6 py-2 text-sm font-semibold text-primary-foreground bg-neon rounded-pill hover:bg-neon-hover disabled:opacity-50 disabled:cursor-not-allowed shadow-neon-glow"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Create Service
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export default function ServicesPage() {
  const { services, isLoading, startService, stopService, createService, configureService } = useServices();
  const { containers: externalContainers, isLoading: isLoadingExternal, startContainer, stopContainer, restartContainer } = useExternalContainers();
  const [showConnStrings, setShowConnStrings] = useState<Record<string, boolean>>({});
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [serviceToConfig, setServiceToConfig] = useState<Service | null>(null);

  const toggleConnString = (id: string) => {
    setShowConnStrings((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const getServiceIcon = (type: string) => {
    switch (type) {
      case 'postgres':
        return <Database className="h-6 w-6 text-blue-400" />;
      case 'redis':
        return <Server className="h-6 w-6 text-red-400" />;
      default:
        return <Database className="h-6 w-6 text-zinc-400" />;
    }
  };

  return (
    <DashboardLayout>
      <div className="px-8 pb-8 pt-2 space-y-6 animate-fade-in relative z-0">
        <CreateServiceModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onCreate={createService}
        />

        <ConfigureServiceModal
          service={serviceToConfig}
          isOpen={serviceToConfig !== null}
          onClose={() => setServiceToConfig(null)}
          onConfigure={configureService}
        />

        {/* Header */}
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <button className="p-2 rounded-pill bg-zinc-900 border border-zinc-800 hover:bg-surface-overlay">
              <ArrowLeft className="w-5 h-5 text-zinc-400" />
            </button>
            <h1 className="text-4xl font-light text-foreground">Services</h1>
          </div>
          <div className="flex items-center space-x-3">
            <button className="p-3 rounded-pill bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-foreground">
              <Filter className="w-5 h-5" />
            </button>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center space-x-2 bg-neon text-primary-foreground font-semibold px-5 py-3 rounded-pill hover:bg-neon-hover transition-colors shadow-neon-glow"
            >
              <Plus className="w-5 h-5" />
              <span>New Service</span>
            </button>
          </div>
        </div>

        {/* Services Grid - Dark Panels */}
        {isLoading ? (
          <div className="bg-surface-elevated rounded-card p-12 text-center border border-zinc-800">
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-2 border-neon border-t-transparent rounded-full animate-spin" />
              <p className="text-zinc-400">Loading services...</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {services.map((service) => (
              <div key={service.id} className="bg-surface-elevated rounded-card p-card border border-zinc-800">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-element bg-zinc-800 border border-zinc-700">
                      {getServiceIcon(service.type)}
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{service.name}</h3>
                      <p className="text-sm text-zinc-500 capitalize">{service.type}</p>
                    </div>
                  </div>
                  <div className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-pill text-xs font-medium",
                    service.status === "running" ? "bg-green-600/20 text-green-400" : "bg-zinc-700 text-zinc-400"
                  )}>
                    <span className={cn(
                      "h-1.5 w-1.5 rounded-pill",
                      service.status === "running" && "bg-green-500 animate-pulse"
                    )} />
                    {service.status}
                  </div>
                </div>

                {/* Connection String */}
                <div className="p-3 rounded-element bg-surface-muted border border-zinc-700 mb-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-zinc-500">Connection String</span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => toggleConnString(service.id)}
                        className="p-1.5 rounded-pill hover:bg-zinc-700 text-zinc-400"
                      >
                        {showConnStrings[service.id] ? (
                          <EyeOff className="h-3 w-3" />
                        ) : (
                          <Eye className="h-3 w-3" />
                        )}
                      </button>
                      <button
                        onClick={() => copyWithToast(service.connectionString)}
                        className="p-1.5 rounded-pill hover:bg-zinc-700 text-zinc-400"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  <p className="font-mono text-xs text-zinc-300 truncate">
                    {showConnStrings[service.id]
                      ? service.connectionString
                      : service.connectionString.replace(/:[^:@]+@/, ':****@')}
                  </p>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <span className="text-xs text-zinc-500">Port</span>
                    <p className="font-medium text-foreground">{service.port}</p>
                  </div>
                  <div>
                    <span className="text-xs text-zinc-500">Memory</span>
                    <p className="font-medium text-foreground">
                      {service.memory || 0} MB
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-4 border-t border-zinc-800">
                  {service.status === 'running' ? (
                    <button
                      onClick={() => stopService(service.id)}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-pill bg-zinc-800 text-foreground border border-zinc-700 hover:bg-zinc-700 text-sm"
                    >
                      <Square className="h-4 w-4" />
                      Stop
                    </button>
                  ) : (
                    <button
                      onClick={() => startService(service.id)}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-pill bg-neon text-primary-foreground hover:bg-neon-hover text-sm"
                    >
                      <Play className="h-4 w-4" />
                      Start
                    </button>
                  )}
                  <button
                    onClick={() => setServiceToConfig(service)}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-pill bg-zinc-800 text-foreground border border-zinc-700 hover:bg-zinc-700 text-sm"
                  >
                    <Settings className="h-4 w-4" />
                    Configure
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Custom Services (External Docker Containers) */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold text-foreground">Custom Services</h2>
            <span
              title="Not managed by Runway — these are Docker containers running on the host that Runway did not deploy. Runway can only start, stop, or restart them."
              className="flex items-center gap-1 px-2 py-0.5 rounded-pill bg-zinc-800 border border-zinc-700 text-xs text-zinc-400 cursor-help"
            >
              <Info className="w-3 h-3" />
              Not managed by Runway
            </span>
          </div>

          {isLoadingExternal ? (
            <div className="bg-surface-elevated rounded-card p-8 text-center border border-zinc-800">
              <div className="flex items-center justify-center gap-3 text-zinc-400">
                <div className="w-5 h-5 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Scanning Docker containers...</span>
              </div>
            </div>
          ) : externalContainers.length === 0 ? (
            <div className="bg-surface-elevated rounded-card p-8 text-center border border-zinc-800 border-dashed">
              <div className="flex flex-col items-center gap-2 text-zinc-500">
                <Box className="w-8 h-8" />
                <p className="text-sm">No external Docker containers found</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {externalContainers.map((container) => (
                <div key={container.id} className="bg-surface-elevated rounded-card p-5 border border-zinc-800 flex flex-col gap-3">
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2.5 rounded-element bg-zinc-800 border border-zinc-700 shrink-0">
                        <Box className="h-5 w-5 text-orange-400" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-foreground truncate" title={container.name}>{container.name}</h3>
                        <p className="text-xs text-zinc-500 font-mono truncate" title={container.image}>{container.image}</p>
                      </div>
                    </div>
                    <div className={cn(
                      'flex items-center gap-1.5 px-2.5 py-1 rounded-pill text-xs font-medium shrink-0 ml-2',
                      container.status === 'running' ? 'bg-green-600/20 text-green-400' : 'bg-zinc-700 text-zinc-400'
                    )}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', container.status === 'running' && 'bg-green-500 animate-pulse')} />
                      {container.status}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-xs text-zinc-500">Ports</span>
                      <p className="text-xs font-mono text-foreground mt-0.5 truncate" title={container.ports || '—'}>
                        {container.ports || <span className="text-zinc-600">none</span>}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-zinc-500">Memory</span>
                      <p className="text-sm font-medium text-foreground">{container.memory ? `${container.memory} MB` : '—'}</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-2 border-t border-zinc-800 mt-auto">
                    {container.status === 'running' ? (
                      <button
                        onClick={() => stopContainer(container.id)}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-pill bg-zinc-800 text-foreground border border-zinc-700 hover:bg-zinc-700 text-xs"
                      >
                        <Square className="h-3.5 w-3.5" /> Stop
                      </button>
                    ) : (
                      <button
                        onClick={() => startContainer(container.id)}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-pill bg-neon text-primary-foreground hover:bg-neon-hover text-xs"
                      >
                        <Play className="h-3.5 w-3.5" /> Start
                      </button>
                    )}
                    <button
                      onClick={() => restartContainer(container.id)}
                      title="Restart container"
                      className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-pill bg-zinc-800 text-foreground border border-zinc-700 hover:bg-zinc-700 text-xs"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Restart
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

