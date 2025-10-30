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
  // Headers de seguridad diferenciados
  async headers() {
    // Determinar si estamos en desarrollo o producción
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    // Obtener dominios permitidos para el widget desde variables de entorno (fuente única)
    const corsOriginsWidget = process.env.CORS_ORIGINS_WIDGET || '';
    
    // Configurar frame-ancestors para /chat basado en el entorno
    let chatFrameAncestors;
    if (isDevelopment) {
      // En desarrollo: permitir orígenes HTTP explícitos
      chatFrameAncestors = "'self' http://localhost:3000 http://localhost:8080";
    } else {
      // En producción: usar dominios específicos de CORS_ORIGINS_WIDGET
      if (corsOriginsWidget) {
        // Convertir la lista de dominios separados por coma en formato CSP
        const allowedDomains = corsOriginsWidget
          .split(',')
          .map(domain => domain.trim())
          .filter(domain => domain && domain !== '*' && !domain.startsWith('file'))
          .join(' ');
        chatFrameAncestors = allowedDomains ? `'self' ${allowedDomains}` : "'self'";
      } else {
        // Fallback: solo mismo origen si no hay configuración específica
        chatFrameAncestors = "'self'";
      }
    }

    return [
      {
        // Configuración para /chat - permite embedding controlado
        source: '/chat',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Content-Security-Policy',
            value: `frame-ancestors ${chatFrameAncestors}`,
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
      {
        // Configuración restrictiva para todas las demás rutas
        source: '/((?!chat).*)',
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
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'none'",
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
      {
        // Headers de caching para recursos estáticos
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
