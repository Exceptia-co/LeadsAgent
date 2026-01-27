/**
 * API Configuration for backend services
 * Uses environment variables in production, localhost for development
 * 
 * IMPORTANT: 
 * - NEXT_PUBLIC_* variables are available on both server and client
 * - Non-prefixed variables (API_URL, WHATSAPP_SERVICE_URL) are server-only
 */

// NestJS API (leads, auth, etc.)
export function getApiUrl(): string {
  // Server-side can use API_URL, client uses NEXT_PUBLIC_API_URL
  return process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3001'
}

// WhatsApp Service (stats, sessions, etc.)
// Works on both client and server
export function getWhatsAppServiceUrl(): string {
  // Server-side can use WHATSAPP_SERVICE_URL, client uses NEXT_PUBLIC_WHATSAPP_SERVICE_URL
  return process.env.WHATSAPP_SERVICE_URL || process.env.NEXT_PUBLIC_WHATSAPP_SERVICE_URL || 'http://localhost:3002'
}

// Helper to check if running in production
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}

// WhatsApp API base URL - for use in client-side components
// This is a constant that gets replaced at build time
export const WHATSAPP_API_URL = process.env.NEXT_PUBLIC_WHATSAPP_SERVICE_URL || 'http://localhost:3002'
