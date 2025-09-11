import { useState, useCallback } from 'react'

export interface Lead {
  id: string
  name: string | null
  phone: string
  status: string
  email?: string | null
  createdAt: string
  whatsappAuthorized?: boolean
}

export interface UseLeadsResult {
  leads: Lead[]
  isLoading: boolean
  error: string | null
  loadLeads: () => Promise<void>
  refreshLeads: () => Promise<void>
  updateLeadWhatsAppAuth: (leadId: string, authorized: boolean) => Promise<boolean>
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
const WHATSAPP_API_BASE_URL = process.env.NEXT_PUBLIC_WHATSAPP_API_URL || 'http://localhost:3002'

export function useLeads(): UseLeadsResult {
  const [leads, setLeads] = useState<Lead[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadLeads = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      let loadedLeads: Lead[] = []

      // Try WhatsApp service first (has both Supabase leads and WhatsApp authorization status)
      try {
        console.log('Loading leads from WhatsApp service...')
        const whatsappResponse = await fetch(`${WHATSAPP_API_BASE_URL}/api/leads?limit=50`, {
          signal: AbortSignal.timeout(5000) // 5 second timeout
        })
        
        if (whatsappResponse.ok) {
          const whatsappData = await whatsappResponse.json()
          loadedLeads = whatsappData.leads || []
          console.log(`✅ Loaded ${loadedLeads.length} leads from WhatsApp service`)
        } else {
          throw new Error(`WhatsApp service error: ${whatsappResponse.statusText}`)
        }
      } catch (whatsappError) {
        console.warn('WhatsApp service not available, trying main API:', whatsappError)
        
        // Fallback to main API (Supabase)
        try {
          const mainApiResponse = await fetch(`${API_BASE_URL}/api/leads?limit=50`, {
            signal: AbortSignal.timeout(5000)
          })
          
          if (mainApiResponse.ok) {
            const mainApiData = await mainApiResponse.json()
            // Map main API response to expected format
            loadedLeads = (mainApiData.leads || []).map((lead: any) => ({
              id: lead.id,
              name: lead.name,
              phone: lead.phone,
              status: lead.status,
              email: lead.email,
              createdAt: lead.createdAt,
              whatsappAuthorized: false // Default to false when loading from main API
            }))
            console.log(`✅ Loaded ${loadedLeads.length} leads from main API (fallback)`)
          } else {
            throw new Error(`Main API error: ${mainApiResponse.statusText}`)
          }
        } catch (mainApiError) {
          console.error('Both services failed:', mainApiError)
          throw new Error('Unable to load leads from any service')
        }
      }

      setLeads(loadedLeads)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load leads'
      setError(errorMessage)
      console.error('Error loading leads:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const updateLeadWhatsAppAuth = useCallback(async (
    leadId: string,
    authorized: boolean
  ): Promise<boolean> => {
    try {
      // Try WhatsApp service first
      const response = await fetch(`${WHATSAPP_API_BASE_URL}/api/leads/${leadId}/whatsapp`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ whatsappAuthorized: authorized })
      })

      if (response.ok) {
        // Update local state
        setLeads(prevLeads => 
          prevLeads.map(lead => 
            lead.id === leadId 
              ? { ...lead, whatsappAuthorized: authorized }
              : lead
          )
        )
        return true
      } else {
        console.error('Failed to update WhatsApp authorization:', response.statusText)
        return false
      }
    } catch (error) {
      console.error('Error updating WhatsApp authorization:', error)
      return false
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
    refreshLeads,
    updateLeadWhatsAppAuth
  }
}
