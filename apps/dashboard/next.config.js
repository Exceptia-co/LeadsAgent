/** @type {import('next').NextConfig} */
const nextConfig = {
  // Configuración para Next.js 14
  experimental: {
    turbo: {
      // Configuración básica de Turbopack para Next.js 14
    },
  },
  poweredByHeader: false,
  
  // Configuración de TypeScript
  typescript: {
    ignoreBuildErrors: false,
  },
  
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
