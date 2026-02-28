import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, X } from 'lucide-react';
import { useDomain } from '@/hooks/useDomain';

const BANNER_DISMISSED_KEY = 'security-banner-dismissed';

export function SecurityBanner() {
  const { isSecure, isLoading, securityMode, domain } = useDomain();
  const [dismissed, setDismissed] = useState(false);

  // Check if banner was previously dismissed in this session
  useEffect(() => {
    const wasDismissed = sessionStorage.getItem(BANNER_DISMISSED_KEY);
    if (wasDismissed === 'true') {
      setDismissed(true);
    }
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem(BANNER_DISMISSED_KEY, 'true');
  };

  // Don't show if loading, secure, or dismissed
  if (isLoading || isSecure || dismissed) {
    return null;
  }

  // HTTPS configured but accessing via HTTP (e.g. via IP)
  const hasHttpsButAccessingViaHttp =
    securityMode === 'domain-https' && window.location.protocol !== 'https:';

  return (
    <div className="bg-yellow-500/10 border-b border-yellow-500/20 px-4 py-2">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-2 text-yellow-600">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm">
            {hasHttpsButAccessingViaHttp ? (
              <>
                You're accessing via HTTP but HTTPS is available.
                {domain?.domain && (
                  <a
                    href={`https://${domain.domain}`}
                    className="underline ml-1 hover:text-yellow-500 transition-colors"
                  >
                    Switch to {domain.domain}
                  </a>
                )}
              </>
            ) : (
              <>
                Running without HTTPS. CLI authentication uses RSA key exchange (MITM vulnerable).
                <Link
                  to="/settings"
                  className="underline ml-1 hover:text-yellow-500 transition-colors"
                >
                  Configure a domain
                </Link>
              </>
            )}
          </span>
        </div>
        <button
          onClick={handleDismiss}
          className="text-yellow-600 hover:text-yellow-500 p-1 rounded transition-colors"
          title="Dismiss for this session"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
