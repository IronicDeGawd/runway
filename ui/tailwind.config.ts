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
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
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
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        panel: {
          DEFAULT: "hsl(var(--panel))",
          foreground: "hsl(var(--panel-foreground))",
        },
        zinc: {
          50: "hsl(var(--zinc-50))",
          100: "hsl(var(--zinc-100))",
          200: "hsl(var(--zinc-200))",
          300: "hsl(var(--zinc-300))",
          400: "hsl(var(--zinc-400))",
          500: "hsl(var(--zinc-500))",
          600: "hsl(var(--zinc-600))",
          700: "hsl(var(--zinc-700))",
          800: "hsl(var(--zinc-800))",
          900: "hsl(var(--zinc-900))",
          950: "hsl(var(--zinc-950))",
        },
        neon: {
          DEFAULT: "hsl(var(--neon))",
          hover: "hsl(var(--neon-hover))",
        },
        // Surface tokens
        surface: {
          DEFAULT: "hsl(var(--surface))",
          elevated: "hsl(var(--surface-elevated))",
          overlay: "hsl(var(--surface-overlay))",
          muted: "hsl(var(--surface-muted))",
        },
        // Status tokens
        status: {
          running: "hsl(var(--status-running))",
          stopped: "hsl(var(--status-stopped))",
          building: "hsl(var(--status-building))",
          error: "hsl(var(--status-error))",
          success: "hsl(var(--status-success))",
          warning: "hsl(var(--status-warning))",
          info: "hsl(var(--status-info))",
        },
        // Service type tokens
        service: {
          postgres: "hsl(var(--service-postgres))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        "3xl": "1.5rem",
        // Custom tokens
        "panel": "2rem",
        "card": "1.5rem",
        "inner": "1rem",
        "element": "0.75rem",
        "pill": "9999px",
      },
      boxShadow: {
        "panel": "0 25px 50px -12px rgb(0 0 0 / 0.25)",
        "card": "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
        "neon-glow": "0 0 20px hsl(var(--neon) / 0.3)",
        "neon-glow-lg": "0 0 20px hsl(var(--neon) / 0.3), 0 0 40px hsl(var(--neon) / 0.2), 0 0 60px hsl(var(--neon) / 0.1)",
        "halo": "0 0 40px hsl(var(--halo-color) / 0.3), 0 0 80px hsl(var(--halo-color) / 0.15)",
      },
      backgroundImage: {
        "halo-glow": "radial-gradient(ellipse at top, hsl(var(--halo-color) / 0.15) 0%, hsl(var(--halo-color) / 0.08) 40%, transparent 70%)",
        "grid-pattern": "linear-gradient(to right, hsl(var(--zinc-800) / 0.3) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--zinc-800) / 0.3) 1px, transparent 1px)",
      },
      backgroundSize: {
        "grid": "40px 40px",
      },
      spacing: {
        "panel": "2rem",
        "card": "1.5rem",
        "section": "1rem",
      },
      
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "shimmer": {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },

      animation: {
        "fade-in": "fade-in 0.3s ease-out",
        "shimmer": "shimmer 1.5s infinite linear",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
