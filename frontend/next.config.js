/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    optimizeCss: true,
    optimizePackageImports: [
      "lucide-react",
      "framer-motion",
      "@dnd-kit/core",
      "@radix-ui/react-icons",
      "@radix-ui/react-accordion",
      "@radix-ui/react-aspect-ratio",
      "@radix-ui/react-avatar",
      "@radix-ui/react-checkbox",
      "@radix-ui/react-collapsible",
      "@radix-ui/react-context-menu",
      "@radix-ui/react-dialog",
      "@radix-ui/react-hover-card",
      "@radix-ui/react-label",
      "@radix-ui/react-menubar",
      "@radix-ui/react-navigation-menu",
      "@radix-ui/react-popover",
      "@radix-ui/react-progress",
      "@radix-ui/react-radio-group",
      "@radix-ui/react-scroll-area",
      "@radix-ui/react-select",
      "@radix-ui/react-separator",
      "@radix-ui/react-slider",
      "@radix-ui/react-slot",
      "@radix-ui/react-switch",
      "@radix-ui/react-tabs",
      "@radix-ui/react-toast",
      "@radix-ui/react-tooltip",
    ],
  },

  compress: true,

  images: {
    formats: ["image/webp", "image/avif"],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },

  webpack: (config, { dev, isServer }) => {
    if (!dev && !isServer) {
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          chunks: "all",
          cacheGroups: {
            vendor: {
              test: /[\\/]node_modules[\\/]/,
              name: "vendors",
              chunks: "all",
              priority: 10,
            },
            ui: {
              test: /[\\/]app[\\/]components[\\/]ui[\\/]/,
              name: "ui-components",
              chunks: "all",
              priority: 20,
            },
            recharts: {
              test: /[\\/]node_modules[\\/](recharts|d3-)[\\/]/,
              name: "recharts",
              chunks: "all",
              priority: 30,
            },
            radix: {
              test: /[\\/]node_modules[\\/]@radix-ui[\\/]/,
              name: "radix-ui",
              chunks: "all",
              priority: 25,
            },
          },
        },
      };
    }

    if (config.optimization.sideEffects === undefined) {
      config.optimization.sideEffects = false;
    }

    return config;
  },

  async headers() {
    const isDev = process.env.NODE_ENV !== "production";
    let apiOrigin = "http://localhost:8000";
    try {
      const u = new URL(
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1",
      );
      apiOrigin = u.origin;
    } catch {}

    // Hosts permitidos para incrustar el widget (iframe).
    // Default seguro: 'self'. Para embeber en sitios externos
    // setear ALLOWED_EMBED_HOSTS="https://campusromero.pe,https://otro.com".
    // Soporta keywords CSP: self, none. Bloquea '*' (riesgo CSRF + abuso).
    // Valida cada origen contra regex para evitar inyección de directivas CSP.
    const CSP_KEYWORDS = new Set(["self", "none"]);
    const ORIGIN_RE = /^https?:\/\/[a-zA-Z0-9.\-]+(?::\d{1,5})?$/;
    const rawEmbedHosts = process.env.ALLOWED_EMBED_HOSTS || "self";
    const embedTokens = rawEmbedHosts
      .split(",")
      .map((h) => h.trim().replace(/^["']|["']$/g, ""))
      .filter((h) => h && h !== "*")
      .map((h) => {
        const lower = h.toLowerCase();
        if (CSP_KEYWORDS.has(lower)) return `'${lower}'`;
        if (ORIGIN_RE.test(h)) return h;
        // Token inválido — descartar y advertir
        // eslint-disable-next-line no-console
        console.warn(
          `[next.config] ALLOWED_EMBED_HOSTS token descartado (formato inválido): ${h}`,
        );
        return null;
      })
      .filter(Boolean);
    const allowedEmbedHosts = embedTokens.length
      ? embedTokens.join(" ")
      : "'self'";

    // NOTE: 'unsafe-inline' in script-src is required by Next.js 14 for its own
    // inline hydration scripts. Removing it without nonce support breaks the app.
    // TODO: migrate CSP to middleware with per-request nonces to eliminate 'unsafe-inline'.
    // 'unsafe-eval' is restricted to dev only (isDev = NODE_ENV !== 'production').
    const chatCsp = `default-src 'self'; script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}; style-src 'unsafe-inline' 'self'; connect-src 'self' ${apiOrigin}; img-src 'self' data: ${apiOrigin}; frame-ancestors ${allowedEmbedHosts}`;
    const dashCsp = `default-src 'self'; script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}; style-src 'unsafe-inline' 'self'; connect-src 'self' ${apiOrigin}; img-src 'self' data: ${apiOrigin}; frame-src 'self' blob:; frame-ancestors 'self'`;

    const globalCsp = `default-src 'self'; script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}; style-src 'unsafe-inline' 'self'; connect-src 'self' ${apiOrigin}; img-src 'self' data: ${apiOrigin}; frame-src 'self' blob:; frame-ancestors 'self'`;

    return [
      {
        source: "/chat",
        headers: [
          {
            key: "Content-Security-Policy",
            value: chatCsp,
          },
        ],
      },

      {
        source: "/dashboard/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: dashCsp },
        ],
      },

      {
        source: "/auth/login",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Content-Security-Policy",
            value: `default-src 'self'; script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; connect-src 'self' ${apiOrigin}; img-src 'self' data: https://images.unsplash.com; frame-ancestors 'self'`,
          },
        ],
      },

      {
        // Aplicar CSP global a todo MENOS /chat para evitar conflicto de herencia
        source: "/((?!chat).*)",
        headers: [
          { key: "X-DNS-Prefetch-Control", value: "on" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: globalCsp },
        ],
      },

      {
        source: "/widget-loader.js",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=3600, must-revalidate",
          },
        ],
      },

      {
        source: "/static/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
