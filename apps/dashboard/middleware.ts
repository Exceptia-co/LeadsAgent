import { authMiddleware } from "@clerk/nextjs";

export default authMiddleware({
  // Rutas que son públicas y no requieren autenticación
  publicRoutes: [
    "/",
    "/sign-in",
    "/sign-up",
    "/api/webhook", // Para webhooks externos
  ],
  
  // Redirigir después del login
  afterAuth(auth, req, evt) {
    // Si el usuario está autenticado y está en la página de inicio, 
    // redirigir al dashboard
    if (auth.userId && req.nextUrl.pathname === "/") {
      return Response.redirect(new URL("/dashboard", req.url));
    }
    
    // Si el usuario no está autenticado y está intentando acceder 
    // a una ruta protegida, redirigir al login
    if (!auth.userId && req.nextUrl.pathname.startsWith("/dashboard")) {
      return Response.redirect(new URL("/sign-in", req.url));
    }
  },
});

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};
