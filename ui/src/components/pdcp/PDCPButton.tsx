import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { motion, type HTMLMotionProps } from "framer-motion";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const pdcpButtonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-[13px] font-medium transition-all duration-175 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-accent-primary text-accent-primary-foreground rounded-[22px] shadow-glow-accent hover:bg-accent-primary-hover hover:shadow-glow-accent-hover hover:-translate-y-0.5 active:scale-[0.97]",
        secondary:
          "bg-[hsl(0_0%_100%/0.05)] text-text-primary border border-[hsl(0_0%_100%/0.15)] rounded-[22px] hover:bg-[hsl(0_0%_100%/0.08)]",
        ghost:
          "text-text-secondary hover:bg-[hsl(0_0%_100%/0.05)] hover:text-text-primary rounded-lg",
        outline:
          "border border-[hsl(0_0%_100%/0.15)] bg-transparent text-text-secondary rounded-[22px] hover:bg-[hsl(0_0%_100%/0.05)] hover:text-text-primary",
        danger:
          "bg-status-error/10 text-status-error border border-status-error/20 rounded-[22px] hover:bg-status-error/20",
        success:
          "bg-status-running/10 text-status-running border border-status-running/20 rounded-[22px] hover:bg-status-running/20",
        link:
          "text-accent-primary underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-5 py-2.5",
        lg: "h-12 px-6 text-sm",
        icon: "h-9 w-9 rounded-lg",
        "icon-sm": "h-8 w-8 rounded-lg",
        "icon-lg": "h-11 w-11 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface PDCPButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof pdcpButtonVariants> {
  asChild?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
}

const PDCPButton = React.forwardRef<HTMLButtonElement, PDCPButtonProps>(
  ({ className, variant, size, asChild = false, loading, icon, children, disabled, ...props }, ref) => {
    if (asChild) {
      return (
        <Slot
          className={cn(pdcpButtonVariants({ variant, size, className }))}
          ref={ref as any}
          {...(props as any)}
        >
          {children}
        </Slot>
      );
    }

    return (
      <motion.button
        className={cn(pdcpButtonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        {...props}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : icon ? (
          icon
        ) : null}
        {children}
      </motion.button>
    );
  }
);
PDCPButton.displayName = "PDCPButton";

// Icon button wrapper
export interface IconButtonProps extends PDCPButtonProps {}

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ size = "icon", variant = "ghost", ...props }, ref) => {
    return <PDCPButton ref={ref} size={size} variant={variant} {...props} />;
  }
);
IconButton.displayName = "IconButton";

export { PDCPButton, IconButton, pdcpButtonVariants };
