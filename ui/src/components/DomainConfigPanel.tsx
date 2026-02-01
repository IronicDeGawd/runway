import { useState } from 'react';
import { useDomain } from '@/hooks/useDomain';
import { copyWithToast } from '@/lib/clipboard';
import {
  Globe,
  Shield,
  ShieldAlert,
  RefreshCw,
  Trash2,
  CheckCircle,
  XCircle,
  Copy,
  Loader2,
} from 'lucide-react';

export function DomainConfigPanel() {
  const {
    domain,
    securityMode,
    serverIp,
    isSecure,
    isLoading,
    isSettingDomain,
    isRemovingDomain,
    isVerifying,
    setDomain,
    removeDomain,
    verifyDomain,
  } = useDomain();

  const [inputDomain, setInputDomain] = useState('');
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputDomain.trim()) return;

    try {
      await setDomain(inputDomain.trim().toLowerCase());
      setInputDomain('');
    } catch {
      // Error handled by mutation
    }
  };

  const handleRemove = async () => {
    try {
      await removeDomain();
      setShowRemoveConfirm(false);
    } catch {
      // Error handled by mutation
    }
  };

  if (isLoading) {
    return (
      <div className="bg-surface-elevated rounded-card p-card border border-zinc-800">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
        </div>
      </div>
    );
  }

  // Domain is configured and active
  if (domain && domain.active) {
    return (
      <div className="bg-surface-elevated rounded-card p-card border border-zinc-800">
        <div className="flex items-center gap-2 mb-6">
          <Shield className="h-5 w-5 text-green-500" />
          <h2 className="text-lg font-semibold text-foreground">Domain Configuration</h2>
        </div>

        <div className="space-y-4">
          {/* Status */}
          <div className="flex items-center gap-3 p-4 rounded-element bg-green-500/10 border border-green-500/20">
            <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
            <div>
              <p className="font-medium text-green-400">HTTPS Active</p>
              <p className="text-sm text-zinc-400">
                Your control panel is secured with automatic TLS certificates
              </p>
            </div>
          </div>

          {/* Domain Info */}
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-element bg-surface-muted border border-zinc-800">
              <span className="text-zinc-400">Domain</span>
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground">{domain.domain}</span>
                <button
                  onClick={() => copyWithToast(domain.domain)}
                  className="p-1 hover:bg-zinc-700 rounded"
                  title="Copy domain"
                >
                  <Copy className="h-4 w-4 text-zinc-400" />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-element bg-surface-muted border border-zinc-800">
              <span className="text-zinc-400">Security Mode</span>
              <span className="font-medium text-green-400">HTTPS (Full)</span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-element bg-surface-muted border border-zinc-800">
              <span className="text-zinc-400">Verified</span>
              <span className="font-medium text-foreground">
                {domain.verifiedAt
                  ? new Date(domain.verifiedAt).toLocaleDateString()
                  : 'N/A'}
              </span>
            </div>

            {serverIp && (
              <div className="flex items-center justify-between p-3 rounded-element bg-surface-muted border border-zinc-800">
                <span className="text-zinc-400">Server IP</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{serverIp}</span>
                  <button
                    onClick={() => copyWithToast(serverIp)}
                    className="p-1 hover:bg-zinc-700 rounded"
                    title="Copy IP"
                  >
                    <Copy className="h-4 w-4 text-zinc-400" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => verifyDomain()}
              disabled={isVerifying}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-foreground rounded-pill transition-colors disabled:opacity-50"
            >
              {isVerifying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Re-verify
            </button>

            {!showRemoveConfirm ? (
              <button
                onClick={() => setShowRemoveConfirm(true)}
                className="flex items-center gap-2 px-4 py-2 text-red-400 hover:bg-red-500/10 rounded-pill transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                Remove Domain
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm text-zinc-400">Are you sure?</span>
                <button
                  onClick={handleRemove}
                  disabled={isRemovingDomain}
                  className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-pill text-sm disabled:opacity-50"
                >
                  {isRemovingDomain ? 'Removing...' : 'Yes, Remove'}
                </button>
                <button
                  onClick={() => setShowRemoveConfirm(false)}
                  className="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 text-foreground rounded-pill text-sm"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Domain verification failed
  if (domain && domain.verificationStatus === 'failed') {
    return (
      <div className="bg-surface-elevated rounded-card p-card border border-zinc-800">
        <div className="flex items-center gap-2 mb-6">
          <XCircle className="h-5 w-5 text-red-500" />
          <h2 className="text-lg font-semibold text-foreground">Domain Verification Failed</h2>
        </div>

        <div className="space-y-4">
          {/* Error Info */}
          <div className="p-4 rounded-element bg-red-500/10 border border-red-500/20">
            <p className="font-medium text-red-400 mb-2">Domain: {domain.domain}</p>
            {domain.failureReason && (
              <p className="text-sm text-zinc-400">{domain.failureReason}</p>
            )}
          </div>

          {serverIp && (
            <div className="p-4 rounded-element bg-surface-muted border border-zinc-800">
              <p className="text-sm text-zinc-400 mb-2">
                Please update your DNS A record to point to:
              </p>
              <div className="flex items-center gap-2">
                <code className="px-3 py-2 bg-zinc-900 rounded text-neon font-mono">
                  {serverIp}
                </code>
                <button
                  onClick={() => copyWithToast(serverIp)}
                  className="p-2 hover:bg-zinc-700 rounded"
                  title="Copy IP"
                >
                  <Copy className="h-4 w-4 text-zinc-400" />
                </button>
              </div>
              <p className="text-xs text-zinc-500 mt-2">
                DNS propagation can take up to 48 hours
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => verifyDomain()}
              disabled={isVerifying}
              className="flex items-center gap-2 px-4 py-2 bg-neon text-black font-semibold rounded-pill hover:bg-neon/90 transition-colors disabled:opacity-50"
            >
              {isVerifying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Try Again
            </button>

            <button
              onClick={handleRemove}
              disabled={isRemovingDomain}
              className="flex items-center gap-2 px-4 py-2 text-zinc-400 hover:bg-zinc-800 rounded-pill transition-colors disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // No domain configured
  return (
    <div className="bg-surface-elevated rounded-card p-card border border-zinc-800">
      <div className="flex items-center gap-2 mb-6">
        <Globe className="h-5 w-5 text-neon" />
        <h2 className="text-lg font-semibold text-foreground">Domain Configuration</h2>
      </div>

      <div className="space-y-4">
        {/* Current Status */}
        <div className="flex items-center gap-3 p-4 rounded-element bg-yellow-500/10 border border-yellow-500/20">
          <ShieldAlert className="h-5 w-5 text-yellow-500 flex-shrink-0" />
          <div>
            <p className="font-medium text-yellow-400">Running in HTTP Mode</p>
            <p className="text-sm text-zinc-400">
              Configure a domain to enable HTTPS and secure CLI authentication
            </p>
          </div>
        </div>

        {/* Server IP */}
        {serverIp && (
          <div className="p-4 rounded-element bg-surface-muted border border-zinc-800">
            <p className="text-sm text-zinc-400 mb-2">
              1. Point your domain's A record to:
            </p>
            <div className="flex items-center gap-2">
              <code className="px-3 py-2 bg-zinc-900 rounded text-neon font-mono">
                {serverIp}
              </code>
              <button
                onClick={() => copyWithToast(serverIp)}
                className="p-2 hover:bg-zinc-700 rounded"
                title="Copy IP"
              >
                <Copy className="h-4 w-4 text-zinc-400" />
              </button>
            </div>
          </div>
        )}

        {/* Domain Input */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-sm text-zinc-400 mb-2 block">
              2. Enter your domain below:
            </label>
            <input
              type="text"
              value={inputDomain}
              onChange={(e) => setInputDomain(e.target.value)}
              placeholder="example.com"
              className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-lg text-foreground placeholder:text-zinc-500 focus:outline-none focus:border-neon focus:ring-1 focus:ring-neon/20"
            />
          </div>

          <button
            type="submit"
            disabled={!inputDomain.trim() || isSettingDomain}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-neon text-black font-semibold rounded-pill hover:bg-neon/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSettingDomain ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Verifying...
              </>
            ) : (
              <>
                <Shield className="h-4 w-4" />
                Verify & Configure
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
