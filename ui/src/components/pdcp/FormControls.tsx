import * as React from "react";
import { cn } from "@/lib/utils";
import { Eye, EyeOff } from "lucide-react";
import { motion } from "framer-motion";

export interface PDCPInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
  error?: string;
}

const PDCPInput = React.forwardRef<HTMLInputElement, PDCPInputProps>(
  ({ className, type, icon, error, ...props }, ref) => {
    return (
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
            {icon}
          </div>
        )}
        <input
          type={type}
          className={cn(
            "flex h-10 w-full rounded-md border bg-input px-3 py-2 text-sm text-text-primary",
            "placeholder:text-text-muted",
            "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 focus:ring-offset-background",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "transition-all duration-200",
            icon && "pl-10",
            error
              ? "border-status-error focus:ring-status-error"
              : "border-input-border hover:border-card-border focus:border-accent-primary",
            className
          )}
          ref={ref}
          {...props}
        />
        {error && (
          <p className="mt-1.5 text-xs text-status-error">{error}</p>
        )}
      </div>
    );
  }
);
PDCPInput.displayName = "PDCPInput";

// Password input with toggle
export interface PasswordInputProps extends Omit<PDCPInputProps, "type"> {
  showToggle?: boolean;
}

const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ showToggle = true, className, ...props }, ref) => {
    const [showPassword, setShowPassword] = React.useState(false);

    return (
      <div className="relative">
        <PDCPInput
          ref={ref}
          type={showPassword ? "text" : "password"}
          className={cn(showToggle && "pr-10", className)}
          {...props}
        />
        {showToggle && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        )}
      </div>
    );
  }
);
PasswordInput.displayName = "PasswordInput";

// Textarea
export interface PDCPTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string;
}

const PDCPTextarea = React.forwardRef<HTMLTextAreaElement, PDCPTextareaProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <div>
        <textarea
          className={cn(
            "flex min-h-[80px] w-full rounded-md border bg-input px-3 py-2 text-sm text-text-primary",
            "placeholder:text-text-muted",
            "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 focus:ring-offset-background",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "transition-all duration-200 resize-none",
            error
              ? "border-status-error focus:ring-status-error"
              : "border-input-border hover:border-card-border focus:border-accent-primary",
            className
          )}
          ref={ref}
          {...props}
        />
        {error && (
          <p className="mt-1.5 text-xs text-status-error">{error}</p>
        )}
      </div>
    );
  }
);
PDCPTextarea.displayName = "PDCPTextarea";

// Select
export interface PDCPSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: string;
  options: { value: string; label: string }[];
}

const PDCPSelect = React.forwardRef<HTMLSelectElement, PDCPSelectProps>(
  ({ className, error, options, ...props }, ref) => {
    return (
      <div>
        <select
          className={cn(
            "flex h-10 w-full rounded-md border bg-input px-3 py-2 text-sm text-text-primary",
            "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 focus:ring-offset-background",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "transition-all duration-200 cursor-pointer",
            error
              ? "border-status-error focus:ring-status-error"
              : "border-input-border hover:border-card-border focus:border-accent-primary",
            className
          )}
          ref={ref}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {error && (
          <p className="mt-1.5 text-xs text-status-error">{error}</p>
        )}
      </div>
    );
  }
);
PDCPSelect.displayName = "PDCPSelect";

// Form field wrapper
interface FormFieldProps {
  label?: string;
  description?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function FormField({ label, description, required, children, className }: FormFieldProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <label className="text-sm font-medium text-text-primary">
          {label}
          {required && <span className="text-status-error ml-1">*</span>}
        </label>
      )}
      {children}
      {description && (
        <p className="text-xs text-text-muted">{description}</p>
      )}
    </div>
  );
}

export { PDCPInput, PasswordInput, PDCPTextarea, PDCPSelect };
