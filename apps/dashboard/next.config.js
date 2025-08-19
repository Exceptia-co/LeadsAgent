/** @type {import('next').NextConfig} */
const nextConfig = {
  // Optimizaciones de build
  experimental: {
    // Optimización de chunks
    optimizeCss: true,
  },
  
  // Configuración de Turbopack (estable en Next.js 15)
  turbopack: {
    rules: {
      '*.svg': {
        loaders: ['@svgr/webpack'],
        as: '*.js',
      },
    },
  },
  
  // Configuración de compilación
  compiler: {
    // Habilita optimizaciones del compilador SWC
    styledComponents: false,
    // Remueve console.log en producción
    removeConsole: process.env.NODE_ENV === 'production',
  },
  
  // Optimización de bundling
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    if (!dev && !isServer) {
      // Optimizaciones solo en build de producción cliente
      config.optimization.splitChunks = {
        ...config.optimization.splitChunks,
        cacheGroups: {
          ...config.optimization.splitChunks.cacheGroups,
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            chunks: 'all',
          },
        },
      };
    }
    return config;
  },
  
  // Configuración de output
  output: 'standalone',
  
  // Reducir trabajo de análisis
  poweredByHeader: false,
  
  // Configuración de TypeScript más rápida
  typescript: {
    // Skipear type checking durante build (se hace por separado)
    ignoreBuildErrors: false,
  },
  
  eslint: {
    // Durante builds, no ejecutar ESLint (se hace por separado)
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
