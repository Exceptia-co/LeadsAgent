import { useState, useCallback } from 'react'

export interface Lead {
  id: string
  name: string | null
  phone: string
  status: string
  email?: string | null
  createdAt: string
}

export interface UseLeadsResult {
  leads: Lead[]
  isLoading: boolean
  error: string | null
  loadLeads: () => Promise<void>
  refreshLeads: () => Promise<void>
}

const WHATSAPP_API_BASE_URL = process.env.NEXT_PUBLIC_WHATSAPP_API_URL || 'http://localhost:3002'

export function useLeads(): UseLeadsResult {
  const [leads, setLeads] = useState<Lead[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadLeads = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      // Call WhatsApp service for leads
      const response = await fetch(`${WHATSAPP_API_BASE_URL}/api/leads?limit=50`)
      
      if (!response.ok) {
        throw new Error(`Failed to fetch leads: ${response.statusText}`)
      }

      const data = await response.json()
      setLeads(data.leads || [])
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load leads'
      setError(errorMessage)
      console.error('Error loading leads:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const refreshLeads = useCallback(async () => {
    await loadLeads()
  }, [loadLeads])

  return {
    leads,
    isLoading,
    error,
    loadLeads,
    refreshLeads
  }
}
