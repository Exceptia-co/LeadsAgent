import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Define rutas públicas (que no requieren autenticación)
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/select-org(.*)",
  "/api/webhooks/(.*)",
  "/api/public/(.*)", // Todas las rutas API públicas
  "/test-clerk", // Ruta de debugging
]);

// Define rutas protegidas (que requieren autenticación)
const isProtectedRoute = createRouteMatcher(["/dashboard(.*)"]);

export default clerkMiddleware(async (auth, request) => {
  const { nextUrl } = request;

  // === Rutas públicas ===
  if (isPublicRoute(request)) {
    // Para rutas API públicas, evitar cualquier procesamiento de autenticación
    if (nextUrl.pathname.startsWith("/api/public/")) {
      return NextResponse.next();
    }

    // /select-org delega su lógica de auth al Server Component (defensa en
    // profundidad). El middleware no llama auth() aquí para no acoplar la
    // página al middleware ni provocar latencia extra.
    if (nextUrl.pathname.startsWith("/select-org")) {
      return NextResponse.next();
    }

    // Solo "/" llama auth() y redirige según orgId
    const { userId, orgId } = await auth();
    if (userId && nextUrl.pathname === "/") {
      return NextResponse.redirect(new URL(orgId ? "/dashboard" : "/select-org", request.url));
    }
    return NextResponse.next();
  }

  // === Rutas protegidas /dashboard(.*) ===
  if (isProtectedRoute(request)) {
    const { userId, orgId } = await auth();

    // Caso A: sin sesión → /sign-in
    if (!userId) {
      return NextResponse.redirect(new URL("/sign-in", request.url));
    }

    // Caso B: sesión sin org activa → /select-org
    if (!orgId) {
      return NextResponse.redirect(new URL("/select-org", request.url));
    }
  }

  // === Resto de rutas (incluye API routes privadas) ===
  // El middleware NO toca auth aquí. Cada handler aplica su propia
  // protección (requireClerkToken, ClerkAuthGuard, etc.) y devuelve
  // 401 JSON si falla — no redirige a HTML. Esto preserva el contrato
  // existente de las API routes privadas (/api/whatsapp/*, /api/leads/*, etc.).
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
  // Allow Clerk packages that use dynamic imports
  unstable_allowDynamic: ["/node_modules/@clerk/**", "/node_modules/.pnpm/@clerk*/**"],
};
