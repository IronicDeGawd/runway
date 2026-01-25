import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        // Core surfaces
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        surface: {
          DEFAULT: "hsl(var(--surface))",
          elevated: "hsl(var(--surface-elevated))",
          overlay: "hsl(var(--surface-overlay))",
        },
        
        // Panel system
        panel: {
          DEFAULT: "hsl(var(--panel))",
          hover: "hsl(var(--panel-hover))",
          active: "hsl(var(--panel-active))",
          border: "hsl(var(--panel-border))",
        },
        
        // Accent colors
        accent: {
          primary: "hsl(var(--accent-primary))",
          "primary-hover": "hsl(var(--accent-primary-hover))",
          "primary-muted": "hsl(var(--accent-primary-muted))",
          "primary-foreground": "hsl(var(--accent-primary-foreground))",
          DEFAULT: "hsl(var(--accent-primary))",
          foreground: "hsl(var(--accent-primary-foreground))",
        },
        
        // Text hierarchy
        text: {
          primary: "hsl(var(--text-primary))",
          secondary: "hsl(var(--text-secondary))",
          muted: "hsl(var(--text-muted))",
          inverse: "hsl(var(--text-inverse))",
        },
        
        // Status colors
        status: {
          running: "hsl(var(--status-running))",
          stopped: "hsl(var(--status-stopped))",
          warning: "hsl(var(--status-warning))",
          error: "hsl(var(--status-error))",
          building: "hsl(var(--status-building))",
        },
        
        // Surface state variants
        "surface-running": "hsl(var(--surface-running))",
        "surface-error": "hsl(var(--surface-error))",
        "surface-building": "hsl(var(--surface-building))",
        "surface-stopped": "hsl(var(--surface-stopped))",
        
        // Border state variants
        "border-running": "hsl(var(--border-running))",
        "border-error": "hsl(var(--border-error))",
        "border-building": "hsl(var(--border-building))",
        
        // Semantic UI colors
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
          hover: "hsl(var(--card-hover))",
          border: "hsl(var(--card-border))",
        },
        
        // Sidebar
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      
      borderRadius: {
        lg: "var(--radius-lg)",
        md: "var(--radius)",
        sm: "var(--radius-sm)",
        xl: "var(--radius-xl)",
        "2xl": "var(--radius-2xl)",
        "3xl": "var(--radius-3xl)",
        pill: "var(--radius-pill)",
        card: "24px",
        button: "22px",
      },
      
      // Cutout system colors
      cutout: {
        DEFAULT: "hsl(var(--cutout))",
        border: "hsl(var(--cutout-border))",
        light: "hsl(var(--cutout-light))",
        "light-border": "hsl(var(--cutout-light-border))",
      },
      
      boxShadow: {
        sm: "var(--shadow-sm)",
        DEFAULT: "var(--shadow)",
        lg: "var(--shadow-lg)",
        card: "0 4px 20px rgba(0,0,0,0.25)",
        "card-hover": "0 6px 24px rgba(0,0,0,0.3)",
        elevated: "var(--shadow-elevated)",
        modal: "0 8px 40px rgba(0,0,0,0.4)",
        dropdown: "0 4px 16px rgba(0,0,0,0.3)",
        glow: "var(--shadow-glow)",
        "glow-accent": "0 2px 8px rgba(180,255,57,0.3)",
        "glow-accent-hover": "0 4px 12px rgba(180,255,57,0.4)",
        "glow-accent-lg": "0 0 50px -10px hsl(var(--accent-primary) / 0.6)",
        "glow-error": "0 0 20px -5px hsl(var(--status-error) / 0.4)",
        "glow-building": "0 0 20px -5px hsl(var(--status-building) / 0.4)",
        "inner-glow": "inset 0 1px 0 0 hsl(var(--accent-primary) / 0.1)",
      },
      
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "0.875rem" }],
        "metric-xl": ["36px", { lineHeight: "1.1", fontWeight: "600" }],
        "metric-lg": ["32px", { lineHeight: "1.1", fontWeight: "600" }],
        "metric-md": ["24px", { lineHeight: "1.2", fontWeight: "600" }],
        "section": ["20px", { lineHeight: "1.3", fontWeight: "600" }],
        "body": ["14px", { lineHeight: "1.5", fontWeight: "400" }],
        "label": ["13px", { lineHeight: "1.4", fontWeight: "400" }],
        "meta": ["12px", { lineHeight: "1.4", fontWeight: "400" }],
        "micro": ["11px", { lineHeight: "1.3", fontWeight: "500" }],
      },
      
      spacing: {
        "18": "4.5rem",
        "88": "22rem",
        "112": "28rem",
        "128": "32rem",
        "card-padding": "22px",
        "section-gap": "18px",
        "row-height": "54px",
        "micro": "10px",
        "chip-gap": "16px",
      },
      
      keyframes: {
        "accordion-down": {
          from: { height: "0", opacity: "0" },
          to: { height: "var(--radix-accordion-content-height)", opacity: "1" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)", opacity: "1" },
          to: { height: "0", opacity: "0" },
        },
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-out": {
          "0%": { opacity: "1", transform: "translateY(0)" },
          "100%": { opacity: "0", transform: "translateY(8px)" },
        },
        "scale-in": {
          "0%": { transform: "scale(0.96)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "slide-in-left": {
          "0%": { transform: "translateX(-100%)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        "slide-in-right": {
          "0%": { transform: "translateX(100%)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        "slide-in-up": {
          "0%": { transform: "translateY(20px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "stagger-in": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "progress-fill": {
          "0%": { width: "0%" },
          "100%": { width: "var(--progress-width, 100%)" },
        },
        "pulse-subtle": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
        "spin-slow": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        "counter-up": {
          "0%": { transform: "translateY(100%)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "typing": {
          "0%": { width: "0" },
          "100%": { width: "100%" },
        },
        "glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 0 0 hsl(var(--accent-primary) / 0)" },
          "50%": { boxShadow: "0 0 20px 5px hsl(var(--accent-primary) / 0.3)" },
        },
        "draw-ring": {
          "0%": { strokeDashoffset: "283" },
          "100%": { strokeDashoffset: "var(--ring-offset, 0)" },
        },
        "glow-expand": {
          "0%": { boxShadow: "0 0 0 0 hsl(var(--accent-primary) / 0.4)" },
          "100%": { boxShadow: "0 0 30px 5px hsl(var(--accent-primary) / 0)" },
        },
        "shimmer-border": {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-4px)" },
        },
        "status-pulse": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.7", transform: "scale(1.05)" },
        },
        "lift": {
          "0%": { transform: "translateY(0)", boxShadow: "0 4px 20px rgba(0,0,0,0.25)" },
          "100%": { transform: "translateY(-2px)", boxShadow: "0 6px 24px rgba(0,0,0,0.3)" },
        },
      },
      
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.3s ease-out forwards",
        "fade-out": "fade-out 0.3s ease-out forwards",
        "scale-in": "scale-in 0.2s ease-out forwards",
        "slide-in-left": "slide-in-left 0.3s ease-out forwards",
        "slide-in-right": "slide-in-right 0.3s ease-out forwards",
        "slide-in-up": "slide-in-up 0.4s ease-out forwards",
        "stagger-in": "stagger-in 0.4s ease-out forwards",
        "progress-fill": "progress-fill 1s ease-out forwards",
        "pulse-subtle": "pulse-subtle 2s ease-in-out infinite",
        "spin-slow": "spin-slow 3s linear infinite",
        "counter-up": "counter-up 0.5s ease-out forwards",
        "glow-pulse": "glow-pulse 2s ease-in-out infinite",
        "draw-ring": "draw-ring 1.2s ease-out forwards",
        "glow-expand": "glow-expand 0.4s ease-out forwards",
        "shimmer-border": "shimmer-border 2s linear infinite",
        "float": "float 3s ease-in-out infinite",
        "status-pulse": "status-pulse 2s ease-in-out infinite",
      },
      
      transitionTimingFunction: {
        "bounce-in": "cubic-bezier(0.68, -0.55, 0.265, 1.55)",
        "smooth": "cubic-bezier(0.4, 0, 0.2, 1)",
        "entrance": "cubic-bezier(0, 0, 0.2, 1)",
        "spring": "cubic-bezier(0.68, -0.55, 0.265, 1.55)",
      },
      
      transitionDuration: {
        "175": "175ms",
        "225": "225ms",
        "250": "250ms",
        "275": "275ms",
        "350": "350ms",
        "400": "400ms",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
