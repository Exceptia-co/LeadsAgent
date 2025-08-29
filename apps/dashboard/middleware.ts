import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

// Define rutas públicas (que no requieren autenticación)
const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/webhook',
  '/api/public/(.*)', // Todas las rutas API públicas
  '/test-clerk' // Ruta de debugging
])

// Define rutas protegidas (que requieren autenticación)
const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
])

export default clerkMiddleware((auth, request) => {
  const { nextUrl } = request
  
  // Si es una ruta pública, permitir acceso SIN llamar a auth() para evitar errores de clerk
  if (isPublicRoute(request)) {
    // Para rutas API públicas, evitar cualquier procesamiento de autenticación
    if (nextUrl.pathname.startsWith('/api/public/')) {
      return NextResponse.next()
    }
    
    // Para otras rutas públicas, verificar autenticación solo si es necesario
    const { userId } = auth()
    if (userId && nextUrl.pathname === '/') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return NextResponse.next()
  }

  // Para rutas protegidas, verificar autenticación
  const { userId } = auth()
  if (isProtectedRoute(request) && !userId) {
    return NextResponse.redirect(new URL('/sign-in', request.url))
  }

  // Permitir acceso si está autenticado o si no es una ruta protegida
  return NextResponse.next()
})

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};
