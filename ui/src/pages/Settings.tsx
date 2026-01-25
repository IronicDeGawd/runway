import * as React from "react";
import { motion } from "framer-motion";
import {
  Settings as SettingsIcon,
  Moon,
  Bell,
  Shield,
  Server,
  Info,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { DashboardLayout } from "@/components/pdcp/DashboardLayout";
import { PanelCard, PanelCardHeader, PanelCardTitle, PanelCardContent } from "@/components/pdcp/PanelCard";
import { CutoutPanel } from "@/components/pdcp/CutoutPanel";
import { PDCPButton } from "@/components/pdcp/PDCPButton";
import { ConfirmDialog } from "@/components/pdcp/Overlays";
import { cn } from "@/lib/utils";

interface ToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

function Toggle({ enabled, onChange }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => onChange(!enabled)}
      className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
        enabled ? "bg-accent-primary" : "bg-panel-border"
      )}
    >
      <motion.span
        className="inline-block h-4 w-4 transform rounded-full bg-white shadow-sm"
        animate={{ x: enabled ? 24 : 4 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      />
    </button>
  );
}

interface SettingRowProps {
  icon: React.ElementType;
  title: string;
  description: string;
  children: React.ReactNode;
}

function SettingRow({ icon: Icon, title, description, children }: SettingRowProps) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-panel-border last:border-0">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-panel flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5 text-text-muted" />
        </div>
        <div>
          <p className="font-medium text-text-primary">{title}</p>
          <p className="text-sm text-text-muted">{description}</p>
        </div>
      </div>
      <div className="flex-shrink-0 ml-4">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const [darkMode, setDarkMode] = React.useState(true);
  const [notifications, setNotifications] = React.useState(true);
  const [autoRestart, setAutoRestart] = React.useState(true);
  const [showResetDialog, setShowResetDialog] = React.useState(false);

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Settings</h1>
          <p className="text-text-muted text-sm mt-1">Configure your PDCP instance</p>
        </div>

        {/* Settings wrapped in CutoutPanel for depth */}
        <CutoutPanel variant="light" padding="lg" animate>
          {/* Appearance */}
          <div className="mb-6">
            <h2 className="font-semibold text-text-primary flex items-center gap-2 mb-4">
              <SettingsIcon className="w-4 h-4" />
              Appearance
            </h2>
            <SettingRow
              icon={Moon}
              title="Dark Mode"
              description="Use dark theme for the interface"
            >
              <Toggle enabled={darkMode} onChange={setDarkMode} />
            </SettingRow>
          </div>

          {/* Notifications */}
          <div className="mb-6 pt-4 border-t border-panel-border">
            <h2 className="font-semibold text-text-primary flex items-center gap-2 mb-4">
              <Bell className="w-4 h-4" />
              Notifications
            </h2>
            <SettingRow
              icon={Bell}
              title="Desktop Notifications"
              description="Receive notifications for deployments and errors"
            >
              <Toggle enabled={notifications} onChange={setNotifications} />
            </SettingRow>
          </div>

          {/* System */}
          <div className="pt-4 border-t border-panel-border">
            <h2 className="font-semibold text-text-primary flex items-center gap-2 mb-4">
              <Server className="w-4 h-4" />
              System
            </h2>
            <SettingRow
              icon={RefreshCw}
              title="Auto-Restart Crashed Services"
              description="Automatically restart services that crash unexpectedly"
            >
              <Toggle enabled={autoRestart} onChange={setAutoRestart} />
            </SettingRow>
          </div>
        </CutoutPanel>

        {/* System Info */}
        <CutoutPanel variant="default" padding="lg" animate delay={0.1}>
          <div className="flex items-center gap-2 mb-4">
            <Info className="w-4 h-4 text-text-muted" />
            <h3 className="font-semibold text-text-primary">System Information</h3>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-text-muted">Version</span>
              <p className="text-text-primary font-mono">v2.0.0</p>
            </div>
            <div>
              <span className="text-text-muted">Build</span>
              <p className="text-text-primary font-mono">2024.01.20</p>
            </div>
            <div>
              <span className="text-text-muted">Runtime</span>
              <p className="text-text-primary font-mono">Node.js 20.x</p>
            </div>
            <div>
              <span className="text-text-muted">Platform</span>
              <p className="text-text-primary font-mono">Linux x64</p>
            </div>
            <div>
              <span className="text-text-muted">Container</span>
              <p className="text-text-primary font-mono">Docker 24.0</p>
            </div>
            <div>
              <span className="text-text-muted">Uptime</span>
              <p className="text-text-primary font-mono">14d 6h 32m</p>
            </div>
          </div>
        </CutoutPanel>

        {/* Danger Zone */}
        <PanelCard padding="lg" className="border-status-error/30">
          <PanelCardHeader>
            <PanelCardTitle className="text-status-error flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Danger Zone
            </PanelCardTitle>
          </PanelCardHeader>
          <PanelCardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-status-error/5 rounded-lg border border-status-error/20">
              <div>
                <p className="font-medium text-text-primary">Reset PDCP</p>
                <p className="text-sm text-text-muted">
                  Stop all services and remove all data
                </p>
              </div>
              <PDCPButton variant="danger" onClick={() => setShowResetDialog(true)}>
                <Trash2 className="w-4 h-4" />
                Reset
              </PDCPButton>
            </div>
          </PanelCardContent>
        </PanelCard>
      </div>

      <ConfirmDialog
        open={showResetDialog}
        onClose={() => setShowResetDialog(false)}
        onConfirm={() => setShowResetDialog(false)}
        title="Reset PDCP?"
        description="This will stop all running services and permanently delete all projects, data, and configurations. This action cannot be undone."
        confirmLabel="Reset Everything"
        variant="danger"
      />
    </DashboardLayout>
  );
}
