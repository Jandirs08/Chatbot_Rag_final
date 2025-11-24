/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    optimizeCss: true,
    optimizePackageImports: ["lucide-react", "@radix-ui/react-icons"],
  },

  compress: true,

  images: {
    formats: ["image/webp", "image/avif"],
    minimumCacheTTL: 60 * 60 * 24 * 30,
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

    const chatCsp = `default-src 'self'; script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}; style-src 'unsafe-inline' 'self'; connect-src 'self' ${apiOrigin}; frame-ancestors *`;
    const dashCsp = `default-src 'self'; script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}; style-src 'unsafe-inline' 'self'; connect-src 'self' ${apiOrigin}; frame-ancestors 'self'`;

    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-DNS-Prefetch-Control", value: "on" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "origin-when-cross-origin" },
        ],
      },

      {
        // widget
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
        source: "/login",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline'; frame-ancestors 'self'",
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
