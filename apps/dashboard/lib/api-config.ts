/**
 * API Configuration for backend services
 * Uses environment variables in production, localhost for development
 */

// NestJS API (leads, auth, etc.)
export function getApiUrl(): string {
  return process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3001'
}

// WhatsApp Service (stats, sessions, etc.)
export function getWhatsAppServiceUrl(): string {
  return process.env.WHATSAPP_SERVICE_URL || process.env.NEXT_PUBLIC_WHATSAPP_SERVICE_URL || 'http://localhost:3002'
}

// Helper to check if running in production
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}
