import { XCircle, AlertTriangle, Info } from 'lucide-react';
import { DeployWarning } from '@/lib/api';

interface WarningsListProps {
  warnings: DeployWarning[];
  className?: string;
}

export function WarningsList({ warnings, className = '' }: WarningsListProps) {
  if (!warnings || warnings.length === 0) {
    return null;
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {warnings.map((warning, index) => (
        <div
          key={`${warning.code}-${index}`}
          className={`flex items-start gap-3 p-3 rounded-lg border ${
            warning.level === 'critical'
              ? 'bg-red-500/10 border-red-500/30 text-red-400'
              : warning.level === 'warning'
              ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
              : 'bg-blue-500/10 border-blue-500/30 text-blue-400'
          }`}
        >
          <div className="flex-shrink-0 mt-0.5">
            {warning.level === 'critical' && (
              <XCircle className="w-5 h-5 text-red-500" />
            )}
            {warning.level === 'warning' && (
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
            )}
            {warning.level === 'info' && (
              <Info className="w-5 h-5 text-blue-500" />
            )}
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">{warning.message}</p>
            <p className="text-xs opacity-60 mt-0.5">Code: {warning.code}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
