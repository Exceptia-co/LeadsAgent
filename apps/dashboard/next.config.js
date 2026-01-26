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
  // Temporarily ignore TS errors to identify if that's the build issue
  typescript: {
    ignoreBuildErrors: true,
  },
  
  eslint: {
    ignoreDuringBuilds: true,
  },
  
  // Rewrite API routes to backend server (TEMPORARILY DISABLED FOR TESTING)
  // async rewrites() {
  //   return [
  //     {
  //       source: '/api/public/:path*',
  //       destination: 'http://localhost:3001/public/:path*',
  //     },
  //     {
  //       source: '/api/:path*',
  //       destination: 'http://localhost:3001/:path*',
  //     },
  //   ]
  // },
};

module.exports = nextConfig;
