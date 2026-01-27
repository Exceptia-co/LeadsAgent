'use client'

import { useMemo } from 'react'

/**
 * Hook to get the correct WhatsApp API URL based on environment
 * In production, uses the proxy (/api/whatsapp) to avoid Mixed Content issues
 * In development, connects directly to the WhatsApp service
 */
export function useWhatsAppUrl(): string {
  return useMemo(() => {
    // In browser + production, use the proxy to avoid Mixed Content (HTTPS → HTTP blocked)
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
      return '/api/whatsapp'
    }
    // In development, use direct connection
    return process.env.NEXT_PUBLIC_WHATSAPP_SERVICE_URL || 'http://localhost:3002'
  }, [])
}

/**
 * Get WhatsApp URL - for use outside of React components
 * Call this at RUNTIME (in event handlers, callbacks) not at module level
 */
export function getWhatsAppUrl(): string {
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
    return '/api/whatsapp'
  }
  return process.env.NEXT_PUBLIC_WHATSAPP_SERVICE_URL || 'http://localhost:3002'
}
