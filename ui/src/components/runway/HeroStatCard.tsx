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
  const radius = 50;
  const strokeWidth = 10;
  const circumference = 2 * Math.PI * radius;
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

  const getGaugeGradient = (val: number) => {
    if (val >= 95) return { start: "hsl(142 76% 36%)", end: "hsl(142 76% 56%)" };
    if (val >= 80) return { start: "hsl(38 92% 50%)", end: "hsl(38 92% 70%)" };
    return { start: "hsl(0 84% 60%)", end: "hsl(0 84% 80%)" };
  };

  return (
    <motion.div
      className={cn(
        "relative bg-gradient-to-br from-panel via-panel to-panel/50 rounded-3xl p-8",
        "overflow-hidden shadow-2xl border border-panel-border/50",
        className
      )}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      {/* Enhanced gradient background glow */}
      <div 
        className="absolute inset-0 opacity-30 blur-xl"
        style={{
          background: `
            radial-gradient(circle at 15% 50%, ${getGaugeGradient(displayValue).start}40 0%, transparent 40%),
            radial-gradient(circle at 85% 50%, hsl(var(--accent-primary) / 0.15) 0%, transparent 50%)
          `
        }}
      />
      
      <div className="relative z-10 flex items-center gap-10">
        {/* Animated Ring with enhanced styling */}
        <div className="relative flex-shrink-0">
          {/* Outer glow ring */}
          <div 
            className="absolute inset-0 rounded-full blur-2xl opacity-40"
            style={{
              background: `radial-gradient(circle, ${getGaugeGradient(displayValue).start} 0%, transparent 70%)`
            }}
          />
          
          <svg 
            width="180" 
            height="180" 
            viewBox="0 0 140 140"
            className="transform -rotate-90 relative"
            style={{ 
              filter: `drop-shadow(0 4px 20px ${getGaugeGradient(displayValue).start}60)` 
            }}
          >
            {/* Gradient definitions */}
            <defs>
              <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={getGaugeGradient(displayValue).start} />
                <stop offset="100%" stopColor={getGaugeGradient(displayValue).end} />
              </linearGradient>
              <linearGradient id="gaugeGlow" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={getGaugeGradient(displayValue).end} stopOpacity="0.5" />
                <stop offset="100%" stopColor={getGaugeGradient(displayValue).start} stopOpacity="0.8" />
              </linearGradient>
            </defs>
            
            {/* Background ring - subtle */}
            <circle
              cx="70"
              cy="70"
              r={radius}
              fill="none"
              stroke="hsl(var(--surface))"
              strokeWidth={strokeWidth}
            />
            
            {/* Inner glow ring */}
            <circle
              cx="70"
              cy="70"
              r={radius + 3}
              fill="none"
              stroke="url(#gaugeGlow)"
              strokeWidth="2"
              opacity="0.3"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
            />
            
            {/* Main animated progress ring with gradient */}
            <motion.circle
              cx="70"
              cy="70"
              r={radius}
              fill="none"
              stroke="url(#gaugeGradient)"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset }}
              transition={{ duration: 1.2, ease: "easeOut", delay: 0.2 }}
            />
          </svg>
          
          {/* Center content */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <motion.div
              className="flex flex-col items-center"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <span className={cn(
                "text-[40px] font-bold tabular-nums leading-none tracking-tight",
                getHealthColor(displayValue)
              )}>
                {displayValue.toFixed(1)}
              </span>
              <span className="text-[11px] text-text-muted uppercase tracking-[0.2em] mt-1 font-medium">
                Health
              </span>
            </motion.div>
          </div>
        </div>

        {/* Text content */}
        <div className="flex-1 min-w-0">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-4 h-4 text-accent-primary animate-pulse" />
              <span className="text-[11px] font-semibold text-text-muted uppercase tracking-[0.15em]">
                {label}
              </span>
            </div>
            <h2 className="text-3xl font-bold text-text-primary mb-2 tracking-tight">
              All Systems Operational
            </h2>
            {sublabel && (
              <p className="text-sm text-text-secondary leading-relaxed">{sublabel}</p>
            )}
          </motion.div>

          {/* Secondary stats row */}
          {secondaryStats && secondaryStats.length > 0 && (
            <motion.div 
              className="grid grid-cols-3 gap-6 mt-6 pt-5 border-t border-panel-border/60"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.4 }}
            >
              {secondaryStats.map((stat, index) => (
                <div key={index} className="flex flex-col">
                  <span className="text-[10px] text-text-muted uppercase tracking-[0.15em] mb-2 font-medium">
                    {stat.label}
                  </span>
                  <span className="text-[26px] font-bold text-text-primary tabular-nums leading-none">
                    {stat.value}
                    {stat.suffix && <span className="text-sm text-text-muted/80 ml-1.5 font-normal">{stat.suffix}</span>}
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
