import * as React from "react";
import { motion } from "framer-motion";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const cutoutPanelVariants = cva(
  "rounded-3xl overflow-hidden border transition-all duration-200",
  {
    variants: {
      variant: {
        default: [
          "bg-cutout border-cutout-border",
        ],
        light: [
          "bg-cutout-light border-cutout-light-border",
        ],
        dark: [
          "bg-panel border-panel-border",
        ],
        elevated: [
          "bg-cutout border-cutout-border",
          "shadow-elevated",
        ],
      },
      padding: {
        none: "p-0",
        sm: "p-4",
        md: "p-6",
        lg: "p-8",
      },
    },
    defaultVariants: {
      variant: "default",
      padding: "md",
    },
  }
);

export interface CutoutPanelProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cutoutPanelVariants> {
  animate?: boolean;
  delay?: number;
}

const CutoutPanel = React.forwardRef<HTMLDivElement, CutoutPanelProps>(
  ({ className, variant, padding, animate = false, delay = 0, children, ...props }, ref) => {
    if (animate) {
      return (
        <motion.div
          ref={ref}
          className={cn(cutoutPanelVariants({ variant, padding }), className)}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay, ease: "easeOut" }}
          {...(props as any)}
        >
          {children}
        </motion.div>
      );
    }

    return (
      <div
        ref={ref}
        className={cn(cutoutPanelVariants({ variant, padding }), className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);
CutoutPanel.displayName = "CutoutPanel";

// Header component for CutoutPanel
const CutoutPanelHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex items-center justify-between mb-5 pb-4 border-b border-cutout-border",
      className
    )}
    {...props}
  />
));
CutoutPanelHeader.displayName = "CutoutPanelHeader";

// Title component for CutoutPanel
const CutoutPanelTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-lg font-semibold text-text-primary tracking-tight",
      className
    )}
    {...props}
  />
));
CutoutPanelTitle.displayName = "CutoutPanelTitle";

export { CutoutPanel, CutoutPanelHeader, CutoutPanelTitle, cutoutPanelVariants };