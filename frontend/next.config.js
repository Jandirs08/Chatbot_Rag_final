/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  typescript: {
    // !! WARN !!
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors.
    // !! WARN !!
    ignoreBuildErrors: true,
  },
  // Optimizaciones de rendimiento
  experimental: {
    optimizeCss: true,
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons'],
  },
  // Compresión y optimización de imágenes
  compress: true,
  images: {
    formats: ['image/webp', 'image/avif'],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 días
  },
  webpack: (config, { dev, isServer }) => {
    // Alias para imports más limpios
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': require('path').resolve(__dirname, './app'),
    };

    // Optimizaciones de bundle splitting
    if (!dev && !isServer) {
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          chunks: 'all',
          cacheGroups: {
            // Vendor chunks separados para librerías grandes
            vendor: {
              test: /[\\/]node_modules[\\/]/,
              name: 'vendors',
              chunks: 'all',
              priority: 10,
            },
            // Chunk separado para UI components
            ui: {
              test: /[\\/]app[\\/]components[\\/]ui[\\/]/,
              name: 'ui-components',
              chunks: 'all',
              priority: 20,
            },
            // Chunk separado para recharts (librería pesada)
            recharts: {
              test: /[\\/]node_modules[\\/](recharts|d3-)[\\/]/,
              name: 'recharts',
              chunks: 'all',
              priority: 30,
            },
            // Chunk separado para radix-ui
            radix: {
              test: /[\\/]node_modules[\\/]@radix-ui[\\/]/,
              name: 'radix-ui',
              chunks: 'all',
              priority: 25,
            },
          },
        },
      };
    }

    // Tree shaking mejorado (compatible con Next.js)
    if (config.optimization.sideEffects === undefined) {
      config.optimization.sideEffects = false;
    }

    return config;
  },
  // Headers para mejor caching
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
        ],
      },
      {
        source: '/static/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
}

module.exports = nextConfig;
