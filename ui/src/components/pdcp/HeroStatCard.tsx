import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Activity } from "lucide-react";

interface HeroStatCardProps {
  value: number;
  label: string;
  sublabel?: string;
  secondaryStats?: Array<{
    label: string;
    value: string | number;
    suffix?: string;
  }>;
  className?: string;
}

export function HeroStatCard({
  value,
  label,
  sublabel,
  secondaryStats,
  className,
}: HeroStatCardProps) {
  const [displayValue, setDisplayValue] = React.useState(0);
  const circumference = 2 * Math.PI * 42;
  const strokeDashoffset = circumference - (displayValue / 100) * circumference;

  React.useEffect(() => {
    const duration = 1200;
    const steps = 60;
    const stepDuration = duration / steps;
    const increment = value / steps;
    let currentStep = 0;

    const timer = setInterval(() => {
      currentStep++;
      if (currentStep >= steps) {
        setDisplayValue(value);
        clearInterval(timer);
      } else {
        setDisplayValue(Math.round(increment * currentStep * 10) / 10);
      }
    }, stepDuration);

    return () => clearInterval(timer);
  }, [value]);

  const getHealthColor = (val: number) => {
    if (val >= 95) return "text-status-running";
    if (val >= 80) return "text-status-warning";
    return "text-status-error";
  };

  return (
    <motion.div
      className={cn(
        "relative bg-panel rounded-3xl p-6",
        "overflow-hidden shadow-card border border-panel-border",
        className
      )}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      {/* Gradient background glow - enhanced */}
      <div 
        className="absolute inset-0 opacity-40"
        style={{
          background: `radial-gradient(ellipse at 20% 50%, hsl(var(--accent-primary) / 0.2) 0%, transparent 50%)`
        }}
      />
      
      <div className="relative z-10 flex items-center gap-8">
        {/* Animated Ring with gradient + multi-layer glow */}
        <div className="relative flex-shrink-0">
          <svg 
            width="140" 
            height="140" 
            viewBox="0 0 100 100"
            className="transform -rotate-90"
            style={{ 
              filter: `
                drop-shadow(0 0 20px hsl(var(--accent-primary) / 0.5))
                drop-shadow(0 0 40px hsl(var(--accent-primary) / 0.25))
              ` 
            }}
          >
            {/* Gradient definition */}
            <defs>
              <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="hsl(78 100% 61%)" />
                <stop offset="100%" stopColor="hsl(78 100% 61% / 0.3)" />
              </linearGradient>
            </defs>
            
            {/* Background ring */}
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke="hsl(var(--panel-border))"
              strokeWidth="8"
            />
            {/* Animated progress ring with gradient */}
            <motion.circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke="url(#gaugeGradient)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset }}
              transition={{ duration: 1.2, ease: "easeOut", delay: 0.2 }}
            />
          </svg>
          
          {/* Center content */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <motion.span
              className={cn("text-[42px] font-bold tabular-nums leading-none", getHealthColor(displayValue))}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              {displayValue.toFixed(1)}
            </motion.span>
            <span className="text-[10px] text-text-muted uppercase tracking-widest mt-0.5">Health</span>
          </div>
        </div>

        {/* Text content */}
        <div className="flex-1 min-w-0">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-4 h-4 text-accent-primary" />
              <span className="text-xs font-medium text-text-muted uppercase tracking-widest">
                {label}
              </span>
            </div>
            <h2 className="text-2xl font-semibold text-text-primary mb-2">
              All Systems Operational
            </h2>
            {sublabel && (
              <p className="text-sm text-text-secondary">{sublabel}</p>
            )}
          </motion.div>

          {/* Secondary stats row */}
          {secondaryStats && secondaryStats.length > 0 && (
            <motion.div 
              className="flex gap-8 mt-4 pt-4 border-t border-panel-border"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.4 }}
            >
              {secondaryStats.map((stat, index) => (
                <div key={index} className="flex flex-col">
                  <span className="text-[10px] text-text-muted uppercase tracking-widest mb-1">{stat.label}</span>
                  <span className="text-[22px] font-semibold text-text-primary tabular-nums leading-none">
                    {stat.value}
                    {stat.suffix && <span className="text-xs text-text-muted ml-1">{stat.suffix}</span>}
                  </span>
                </div>
              ))}
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
