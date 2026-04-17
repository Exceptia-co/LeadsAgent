/**
 * API Configuration for backend services
 * Uses environment variables in production, localhost for development
 *
 * IMPORTANT:
 * - NEXT_PUBLIC_* variables are available on both server and client
 * - Non-prefixed variables (API_URL, WHATSAPP_SERVICE_URL) are server-only
 * - In production, client-side calls should use the proxy routes (/api/whatsapp/*)
 *   to avoid Mixed Content (HTTPS page → HTTP service) issues
 */

// NestJS API (leads, auth, etc.)
export function getApiUrl(): string {
  // Server-side can use API_URL, client uses NEXT_PUBLIC_API_URL
  return process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3003";
}

// WhatsApp Service - INTERNAL use only (server-side proxy)
// For client-side, use getWhatsAppProxyUrl() instead
export function getWhatsAppServiceUrl(): string {
  // Server-side can use WHATSAPP_SERVICE_URL, client uses NEXT_PUBLIC_WHATSAPP_SERVICE_URL
  return (
    process.env.WHATSAPP_SERVICE_URL ||
    process.env.NEXT_PUBLIC_WHATSAPP_SERVICE_URL ||
    "http://localhost:3002"
  );
}

// WhatsApp Proxy URL - for CLIENT-SIDE use
// In production, routes through Next.js API to avoid Mixed Content issues
// In development, can connect directly to local service
export function getWhatsAppProxyUrl(): string {
  // In production (browser), always use the proxy
  if (typeof window !== "undefined" && process.env.NODE_ENV === "production") {
    return "/api/whatsapp";
  }
  // In development or server-side, use direct URL
  return process.env.NEXT_PUBLIC_WHATSAPP_SERVICE_URL || "http://localhost:3002";
}

// Helper to check if running in production
export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

// WhatsApp API base URL - for use in client-side components
// NOTE: This constant is evaluated at BUILD TIME, so it can't detect browser context
// For runtime detection, components should call getWhatsAppClientUrl() instead
export const WHATSAPP_API_URL =
  process.env.NEXT_PUBLIC_WHATSAPP_SERVICE_URL || "http://localhost:3002";

// Get the correct WhatsApp URL for client-side requests
// Call this at RUNTIME (e.g., in useEffect or event handlers) not at module level
export function getWhatsAppClientUrl(): string {
  // In browser + production, use the proxy to avoid Mixed Content
  if (typeof window !== "undefined" && process.env.NODE_ENV === "production") {
    return "/api/whatsapp";
  }
  // In development or SSR, use direct URL
  return process.env.NEXT_PUBLIC_WHATSAPP_SERVICE_URL || "http://localhost:3002";
}
