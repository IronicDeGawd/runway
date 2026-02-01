import { DashboardLayout } from '@/components/DashboardLayout';
import { DomainConfigPanel } from '@/components/DomainConfigPanel';
import { Info, AlertTriangle, ArrowLeft, Loader2 } from 'lucide-react';
import { useSystemInfo, formatDate } from '@/hooks/useSystemInfo';

/* Switch component - commented out (used by mocked User Preferences)
function Switch({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return (
    <label className="relative inline-flex items-center cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onCheckedChange(e.target.checked)}
        className="sr-only peer"
      />
      <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-pill peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-pill after:h-5 after:w-5 after:transition-all peer-checked:bg-neon"></div>
    </label>
  );
}
*/

export default function SettingsPage() {
  const { systemInfo, isLoading: isSystemLoading } = useSystemInfo();

  return (
    <DashboardLayout>
      <div className="px-8 pb-8 pt-2 space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center space-x-4">
          <button className="p-2 rounded-pill bg-zinc-900 border border-zinc-800 hover:bg-surface-overlay">
            <ArrowLeft className="w-5 h-5 text-zinc-400" />
          </button>
          <div>
            <h1 className="text-4xl font-light text-foreground">Settings</h1>
            <p className="text-zinc-500 mt-1">Manage your preferences and system configuration</p>
          </div>
        </div>

        {/* Domain Configuration & System Info - Side by Side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Domain Configuration */}
          <DomainConfigPanel />

          {/* System Info - Dark Panel */}
          <div className="bg-surface-elevated rounded-card p-card border border-zinc-800">
            <div className="flex items-center gap-2 mb-6">
              <Info className="h-5 w-5 text-neon" />
              <h2 className="text-lg font-semibold text-foreground">System Information</h2>
            </div>
            {isSystemLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-element bg-surface-muted border border-zinc-800">
                  <span className="text-zinc-400">Version</span>
                  <span className="font-medium text-foreground">v{systemInfo?.version || '-'}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-element bg-surface-muted border border-zinc-800">
                  <span className="text-zinc-400">Node.js Runtime</span>
                  <span className="font-medium text-foreground">{systemInfo?.nodeVersion || '-'}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-element bg-surface-muted border border-zinc-800">
                  <span className="text-zinc-400">Platform</span>
                  <span className="font-medium text-foreground">{systemInfo?.platform || '-'}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-element bg-surface-muted border border-zinc-800">
                  <span className="text-zinc-400">Last Updated</span>
                  <span className="font-medium text-foreground">{formatDate(systemInfo?.lastUpdated || null)}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Danger Zone */}
        <div className="bg-red-950/20 rounded-card p-card border border-red-900/30">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-element bg-red-900/20">
              <AlertTriangle className="h-6 w-6 text-red-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-red-400 mb-2">Danger Zone</h2>
              <p className="text-zinc-400 mb-4">
                Reset all settings to their default values. This action cannot be undone and will restart all services.
              </p>
              <button className="bg-red-600 text-white font-semibold px-6 py-2 rounded-pill hover:bg-red-700 transition-colors">
                Factory Reset
              </button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
