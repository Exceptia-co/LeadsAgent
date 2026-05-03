/** @type {import('next').NextConfig} */
const nextConfig = {
  // Configuración para Next.js 14
  experimental: {
    // Handle Clerk packages for Edge Runtime compatibility in Next.js 14.
    // PR5a-deploy fix: also externalize @prisma/client + .prisma so Next
    // does not try to bundle the engine binary into the function — the
    // binary lives in node_modules and is loaded at runtime.
    serverComponentsExternalPackages: [
      '@clerk/backend',
      '@clerk/shared',
      '@prisma/client',
      '.prisma/client',
      '@leadcrm/db',
    ],
    // PR5a-deploy fix: ensure Next bundles the rhel-openssl-3.0.x Prisma
    // engine binary into Vercel function output. Without this trace,
    // tenant-lookup.ts (Vercel function) fails with
    // PrismaClientInitializationError "could not locate Query Engine".
    outputFileTracingIncludes: {
      '/api/**/*': [
        '../../node_modules/.pnpm/@prisma+client*/node_modules/.prisma/client/**/*',
        '../../node_modules/.pnpm/.prisma/**/*',
        '../../node_modules/@prisma/client/**/*',
        '../../node_modules/.prisma/**/*',
      ],
    },
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
