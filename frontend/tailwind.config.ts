import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // <--- Añade esta sección
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        surface: {
          DEFAULT: "hsl(var(--surface))",
          elevated: "hsl(var(--surface-elevated))",
          2: "hsl(var(--surface-2))",
          3: "hsl(var(--surface-3))",
        },
        brand: {
          DEFAULT: "hsl(var(--primary))",
          hover: "hsl(var(--primary))",
          light: "hsl(var(--primary-faint))",
          foreground: "#ffffff",
        },
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
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        error: {
          DEFAULT: "hsl(var(--error))",
          foreground: "hsl(var(--error-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
        },
        amber: {
          DEFAULT: "hsl(var(--amber))",
          foreground: "hsl(var(--amber-foreground))",
        },
        "accent-violet": {
          DEFAULT: "hsl(var(--accent-violet))",
          foreground: "hsl(var(--accent-violet-foreground))",
        },
        "accent-cyan": {
          DEFAULT: "hsl(var(--accent-cyan))",
          foreground: "hsl(var(--accent-cyan-foreground))",
        },
        "accent-magenta": {
          DEFAULT: "hsl(var(--accent-magenta))",
          foreground: "hsl(var(--accent-magenta-foreground))",
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
        sidebar: {
          // <--- Añade esta sección para los colores del sidebar
          background: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Inter", "system-ui", "sans-serif"],
        heading: [
          "var(--font-heading)",
          "'Space Grotesk'",
          "system-ui",
          "sans-serif",
        ],
        mono: ["var(--font-mono-ui)", "'DM Mono'", "'Fira Code'", "monospace"],
      },
      borderRadius: {
        sm: "calc(var(--radius) - 4px)",
        md: "calc(var(--radius) - 2px)",
        lg: "var(--radius)",
        xl: "calc(var(--radius) + 4px)",
        "2xl": "calc(var(--radius) + 8px)",
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
        "out-back": "cubic-bezier(0.34, 1.56, 0.64, 1)",
        "in-out-circ": "cubic-bezier(0.85, 0, 0.15, 1)",
      },
      transitionDuration: {
        "320": "320ms",
        "560": "560ms",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        card: "var(--shadow-card)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        hover: "var(--shadow-hover)",
        "glow-primary": "var(--shadow-glow-primary)",
        "glow-violet": "var(--shadow-glow-violet)",
        "glow-cyan": "var(--shadow-glow-cyan)",
        "glow-magenta": "var(--shadow-glow-magenta)",
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"),
    (() => {
      try {
        return require("@tailwindcss/typography");
      } catch (_e) {
        return () => {};
      }
    })(),
  ],
};
export default config;
