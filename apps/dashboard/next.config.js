/** @type {import('next').NextConfig} */
const nextConfig = {
  // Configuración para Next.js 14
  experimental: {
    turbo: {
      // Configuración básica de Turbopack para Next.js 14
    },
  },

  // Handle Clerk packages for Edge Runtime compatibility
  serverExternalPackages: ["@clerk/backend", "@clerk/shared"],

  poweredByHeader: false,
  
  // Configuración de TypeScript
  typescript: {
    ignoreBuildErrors: false,
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
