import * as React from "react";
import { motion } from "framer-motion";
import {
  Database,
  Server,
  Play,
  Square,
  Eye,
  EyeOff,
  Copy,
  Check,
  HardDrive,
} from "lucide-react";
import { DashboardLayout } from "@/components/pdcp/DashboardLayout";
import { PanelCard, PanelCardHeader, PanelCardTitle, PanelCardContent } from "@/components/pdcp/PanelCard";
import { CutoutPanel } from "@/components/pdcp/CutoutPanel";
import { StatusPill } from "@/components/pdcp/StatusPill";
import { PDCPButton, IconButton } from "@/components/pdcp/PDCPButton";
import { Skeleton } from "@/components/pdcp/ProgressElements";
import { useServices, Service } from "@/hooks/useServices";
import { cn } from "@/lib/utils";

function ServiceCard({ service, onStart, onStop }: { service: Service; onStart: () => void; onStop: () => void }) {
  const [showConnection, setShowConnection] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(service.connectionString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const Icon = service.type === "postgres" ? Database : Server;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative"
    >
      <PanelCard padding="lg" hover className="h-full">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center",
              service.type === "postgres" ? "bg-status-building/20" : "bg-status-error/20"
            )}>
              <Icon className={cn(
                "w-6 h-6",
                service.type === "postgres" ? "text-status-building" : "text-status-error"
              )} />
            </div>
            <div>
              <h3 className="font-semibold text-text-primary">{service.name}</h3>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-text-muted uppercase">{service.type}</span>
                <span className="text-xs text-text-muted">v{service.version}</span>
              </div>
            </div>
          </div>
          <StatusPill variant={service.status} pulse={service.status === "running"}>
            {service.status}
          </StatusPill>
        </div>

        {/* Stats */}
        <div className="flex gap-4 mb-4 pb-4 border-b border-panel-border">
          <div>
            <span className="text-xs text-text-muted">Port</span>
            <p className="text-sm font-medium text-text-primary">{service.port}</p>
          </div>
          <div>
            <span className="text-xs text-text-muted">Memory</span>
            <p className="text-sm font-medium text-text-primary">
              {service.status === 'running' ? `${service.memory || 0}MB` : '-'}
            </p>
          </div>
        </div>

        {/* Connection string */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-muted">Connection String</span>
            <div className="flex gap-1">
              <IconButton
                size="icon-sm"
                variant="ghost"
                onClick={() => setShowConnection(!showConnection)}
              >
                {showConnection ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </IconButton>
              <IconButton size="icon-sm" variant="ghost" onClick={handleCopy}>
                {copied ? <Check className="w-3.5 h-3.5 text-status-running" /> : <Copy className="w-3.5 h-3.5" />}
              </IconButton>
            </div>
          </div>
          <div className="bg-surface rounded-lg p-2.5 font-mono text-xs text-text-secondary overflow-x-auto">
            {showConnection ? service.connectionString : "•".repeat(30)}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-4 pt-4 border-t border-panel-border">
          {service.status === "running" ? (
            <PDCPButton variant="danger" size="sm" className="flex-1" onClick={onStop}>
              <Square className="w-4 h-4" />
              Stop
            </PDCPButton>
          ) : (
            <PDCPButton variant="success" size="sm" className="flex-1" onClick={onStart}>
              <Play className="w-4 h-4" />
              Start
            </PDCPButton>
          )}
        </div>
      </PanelCard>
    </motion.div>
  );
}

export default function ServicesPage() {
  const { services, isLoading, startService, stopService } = useServices();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Services</h1>
          <p className="text-text-muted text-sm mt-1">Managed database and cache services</p>
        </div>

        {/* Info banner */}
        <div className="bg-accent-primary-muted/30 border border-accent-primary/20 rounded-xl p-4 flex items-start gap-3">
          <HardDrive className="w-5 h-5 text-accent-primary flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-text-primary">Optional Services</p>
            <p className="text-xs text-text-muted mt-1">
              These services are managed by PDCP and persist across project restarts.
              Connection strings are automatically injected into your projects.
            </p>
          </div>
        </div>

        {/* Services grid - wrapped in CutoutPanel for depth */}
        <CutoutPanel variant="light" padding="lg" animate>
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-64" />
              ))}
            </div>
          ) : services.length === 0 ? (
            <div className="text-center py-12">
              <Server className="w-12 h-12 text-text-muted mx-auto mb-4 opacity-50" />
              <p className="text-text-muted text-sm">No services available</p>
              <p className="text-text-muted text-xs mt-1">Make sure Docker is installed and running</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {services.map((service) => (
                <ServiceCard
                  key={service.id}
                  service={service}
                  onStart={() => startService(service.id)}
                  onStop={() => stopService(service.id)}
                />
              ))}
            </div>
          )}
        </CutoutPanel>

        {/* Add more services hint */}
        <div className="text-center py-8">
          <p className="text-text-muted text-sm">
            More services coming soon: MongoDB, MySQL, MinIO...
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
