import { useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useServices } from '@/hooks/useServices';
import { Database, Server, Copy, Eye, EyeOff, Plus, Play, Square, ArrowLeft, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ServicesPage() {
  const { services, startService, stopService } = useServices();
  const [showConnStrings, setShowConnStrings] = useState<Record<string, boolean>>({});

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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <DashboardLayout>
      <div className="px-8 pb-8 pt-2 space-y-6 animate-fade-in">
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
            <button className="flex items-center space-x-2 bg-neon text-primary-foreground font-semibold px-5 py-3 rounded-pill hover:bg-neon-hover transition-colors shadow-neon-glow">
              <Plus className="w-5 h-5" />
              <span>New Service</span>
            </button>
          </div>
        </div>

        {/* Services Grid - Dark Panels */}
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
                      onClick={() => copyToClipboard(service.connectionString)}
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
                <button className="flex-1 px-4 py-2 rounded-pill bg-zinc-800 text-foreground border border-zinc-700 hover:bg-zinc-700 text-sm">
                  Configure
                </button>
              </div>
            </div>
          ))}
        </div>

        {services.length === 0 && (
          <div className="bg-surface-elevated rounded-card p-12 text-center border border-zinc-800">
            <div className="max-w-md mx-auto space-y-4">
              <div className="w-20 h-20 mx-auto rounded-pill bg-zinc-800 flex items-center justify-center">
                <Database className="w-10 h-10 text-zinc-400" />
              </div>
              <div>
                <h3 className="text-2xl font-semibold text-foreground mb-2">No services configured yet</h3>
                <p className="text-zinc-400">
                  Easily deploy managed databases like PostgreSQL and Redis to power your applications
                </p>
              </div>
              <div className="flex items-center justify-center gap-3 pt-4">
                <button className="flex items-center gap-2 px-6 py-3 rounded-pill bg-neon text-primary-foreground font-semibold hover:bg-neon-hover transition-colors shadow-neon-glow">
                  <Plus className="w-5 h-5" />
                  <span>Create Service</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
