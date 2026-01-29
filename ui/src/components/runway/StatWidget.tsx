import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";

const statWidgetVariants = cva(
  "relative bg-panel rounded-[14px] shadow-card transition-all duration-175",
  {
    variants: {
      size: {
        sm: "p-4",
        md: "p-5",
        lg: "p-6",
        xl: "p-6",
      },
      hoverable: {
        true: "hover:bg-panel-hover hover:-translate-y-0.5 hover:shadow-card-hover cursor-pointer",
        false: "",
      },
    },
    defaultVariants: {
      size: "md",
      hoverable: false,
    },
  }
);

interface StatWidgetProps extends VariantProps<typeof statWidgetVariants> {
  label: string;
  value: string | number;
  suffix?: string;
  secondaryText?: string;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  icon?: React.ReactNode;
  className?: string;
  delay?: number;
  animate?: boolean;
}

export function StatWidget({
  label,
  value,
  suffix,
  secondaryText,
  trend,
  trendValue,
  icon,
  className,
  delay = 0,
  animate = true,
  size = "md",
  hoverable = false,
}: StatWidgetProps) {
  const [displayValue, setDisplayValue] = React.useState(animate ? 0 : value);

  React.useEffect(() => {
    if (!animate || typeof value !== "number") {
      setDisplayValue(value);
      return;
    }

    const duration = 1000;
    const steps = 30;
    const stepDuration = duration / steps;
    const increment = value / steps;
    let currentStep = 0;

    const timer = setInterval(() => {
      currentStep++;
      if (currentStep >= steps) {
        setDisplayValue(value);
        clearInterval(timer);
      } else {
        setDisplayValue(Math.round(increment * currentStep));
      }
    }, stepDuration);

    return () => clearInterval(timer);
  }, [value, animate]);

  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor =
    trend === "up"
      ? "text-status-running"
      : trend === "down"
      ? "text-status-error"
      : "text-text-muted";

  const valueSizeClass = size === "xl" 
    ? "text-[36px]" 
    : size === "lg" 
    ? "text-[32px]" 
    : size === "md" 
    ? "text-[24px]" 
    : "text-[20px]";

  return (
    <motion.div
      className={cn(statWidgetVariants({ size, hoverable }), className)}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay, ease: "easeOut" }}
    >
      <div className="flex items-start justify-between mb-2">
        <span className="text-[11px] font-medium text-text-muted uppercase tracking-wider">
          {label}
        </span>
        {icon && (
          <div className="text-text-muted">
            {icon}
          </div>
        )}
      </div>

      <div className="flex items-baseline gap-1">
        <motion.span
          className={cn("font-semibold text-text-primary tabular-nums", valueSizeClass)}
          key={String(displayValue)}
        >
          {displayValue}
        </motion.span>
        {suffix && (
          <span className="text-[13px] text-text-muted">{suffix}</span>
        )}
      </div>

      {(secondaryText || (trend && trendValue)) && (
        <div className="flex items-center gap-2 mt-2">
          {trend && trendValue && (
            <div className={cn("flex items-center gap-1 text-[12px]", trendColor)}>
              <TrendIcon className="w-3 h-3" />
              <span>{trendValue}</span>
            </div>
          )}
          {secondaryText && (
            <span className="text-[12px] text-text-muted">{secondaryText}</span>
          )}
        </div>
      )}
    </motion.div>
  );
}

interface MiniChartProps {
  data: number[];
  color?: string;
  className?: string;
}

export function MiniChart({ data, color = "accent-primary", className }: MiniChartProps) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  // Generate bar chart instead of line for better visual match
  const barWidth = 8;
  const barGap = 4;

  return (
    <svg className={cn("w-full h-12", className)} viewBox={`0 0 ${data.length * (barWidth + barGap)} 100`} preserveAspectRatio="none">
      {data.map((val, i) => {
        const height = ((val - min) / range) * 80 + 10;
        const isLast = i === data.length - 1;
        return (
          <rect
            key={i}
            x={i * (barWidth + barGap)}
            y={100 - height}
            width={barWidth}
            height={height}
            rx="3"
            fill={isLast ? `hsl(var(--${color}))` : `hsl(var(--panel-border))`}
            className={isLast ? "opacity-100" : "opacity-60"}
          />
        );
      })}
    </svg>
  );
}
