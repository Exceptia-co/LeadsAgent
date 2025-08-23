import { useState, useCallback } from 'react'

const WHATSAPP_API_BASE_URL = process.env.NEXT_PUBLIC_WHATSAPP_API_URL || 'http://localhost:3002'
const MAX_RETRIES = 3
const BASE_RETRY_DELAY = 1000 // 1 second

interface ApiResponse<T = any> {
  success?: boolean
  data?: T
  sessions?: any[]
  error?: string
  isLoading: boolean
}

interface Message {
  id: string
  content: string
  direction: 'INBOUND' | 'OUTBOUND'
  messageType: 'text' | 'image' | 'document' | 'audio' | 'video'
  status: 'sent' | 'delivered' | 'read' | 'failed' | 'received'
  createdAt: string
}

interface Lead {
  id: string
  name: string
  phone: string
  status: string
  score?: number
}

interface Conversation {
  id: string
  leadId: string
  lead: Lead
  lastMessage?: Message
  unreadCount: number
  updatedAt: string
}

interface ConversationWithMessages {
  conversation: {
    id: string
    lead: Lead
    messages: Message[]
  }
}

// Utility function for exponential backoff
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Utility function to check if service is available
const checkServiceHealth = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${WHATSAPP_API_BASE_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000) // 5 second timeout
    })
    return response.ok
  } catch {
    return false
  }
}

export function useWhatsAppApi() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const makeApiCall = useCallback(async <T>(
    endpoint: string,
    options: RequestInit = {},
    retries: number = MAX_RETRIES
  ): Promise<T> => {
    let lastError: Error | null = null
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        if (attempt === 0) {
          setIsLoading(true)
          setError(null)
        }

        // Check service health on first attempt
        if (attempt === 0) {
          const isHealthy = await checkServiceHealth()
          if (!isHealthy) {
            throw new Error('WhatsApp service is not available')
          }
        }

        const response = await fetch(`${WHATSAPP_API_BASE_URL}/api${endpoint}`, {
          headers: {
            'Content-Type': 'application/json',
            ...options.headers,
          },
          signal: AbortSignal.timeout(10000), // 10 second timeout
          ...options,
        })

        if (!response.ok) {
          // Don't retry on client errors (4xx)
          if (response.status >= 400 && response.status < 500) {
            throw new Error(`API Error: ${response.statusText} (${response.status})`)
          }
          // Retry on server errors (5xx)
          throw new Error(`Server Error: ${response.statusText} (${response.status})`)
        }

        const data = await response.json()
        
        // Reset error state on success
        if (error) {
          setError(null)
        }
        
        return data
      } catch (err) {
        lastError = err instanceof Error ? err : new Error('Unknown error occurred')
        
        // Don't retry on client errors or if this is the last attempt
        if (attempt === retries || (lastError.message.includes('API Error') && lastError.message.includes('4'))) {
          break
        }
        
        // Exponential backoff delay
        const delayMs = BASE_RETRY_DELAY * Math.pow(2, attempt)
        await delay(delayMs)
        
        console.warn(`WhatsApp API attempt ${attempt + 1} failed, retrying in ${delayMs}ms:`, lastError.message)
      }
    }
    
    // All retries exhausted
    const errorMessage = lastError?.message || 'Unknown error occurred'
    setError(errorMessage)
    setIsLoading(false)
    throw lastError || new Error(errorMessage)
  }, [error])

  // Conversation methods with fallback
  const getConversations = useCallback(async (
    limit = 50,
    offset = 0
  ): Promise<Conversation[]> => {
    try {
      return await makeApiCall(`/conversations?limit=${limit}&offset=${offset}`)
    } catch (error) {
      console.error('Error loading conversations:', error)
      // Return empty array as fallback
      return []
    }
  }, [makeApiCall])

  const getConversationMessages = useCallback(async (
    conversationId: string,
    limit = 50,
    offset = 0
  ): Promise<ConversationWithMessages> => {
    try {
      return await makeApiCall(`/conversations/${conversationId}/messages?limit=${limit}&offset=${offset}`)
    } catch (error) {
      console.error('Error loading conversation messages:', error)
      // Return mock conversation structure as fallback
      return {
        conversation: {
          id: conversationId,
          lead: {
            id: 'unknown',
            name: 'Error loading lead',
            phone: 'unknown',
            status: 'ERROR'
          },
          messages: []
        }
      }
    }
  }, [makeApiCall])

  const sendMessage = useCallback(async (
    conversationId: string,
    sessionId: string,
    message: string,
    type: 'text' | 'image' | 'document' | 'audio' | 'video' = 'text'
  ): Promise<boolean> => {
    try {
      const result = await makeApiCall(`/conversations/${conversationId}/send`, {
        method: 'POST',
        body: JSON.stringify({
          sessionId,
          message,
          type
        })
      }) as { success?: boolean }
      return result.success || false
    } catch (error) {
      console.error('Error sending message:', error)
      return false
    }
  }, [makeApiCall])

  // Direct message sending (without conversation)
  const sendDirectMessage = useCallback(async (
    sessionId: string,
    phone: string,
    message: string,
    type: 'text' | 'image' | 'document' | 'audio' | 'video' = 'text'
  ): Promise<boolean> => {
    return makeApiCall('/messages/send', {
      method: 'POST',
      body: JSON.stringify({
        sessionId,
        phone,
        message,
        type
      })
    })
  }, [makeApiCall])

  // Session methods
  const getSessions = useCallback(async () => {
    return makeApiCall('/sessions')
  }, [makeApiCall])

  const createSession = useCallback(async (sessionId: string, name?: string) => {
    return makeApiCall('/sessions', {
      method: 'POST',
      body: JSON.stringify({ sessionId, name })
    })
  }, [makeApiCall])

  const getSessionStatus = useCallback(async (sessionId: string) => {
    return makeApiCall(`/sessions/${sessionId}/status`)
  }, [makeApiCall])

  const deleteSession = useCallback(async (sessionId: string) => {
    return makeApiCall(`/sessions/${sessionId}`, {
      method: 'DELETE'
    })
  }, [makeApiCall])

  // Analytics methods
  const getMessageAnalytics = useCallback(async (
    sessionId?: string,
    startDate?: string,
    endDate?: string
  ) => {
    const params = new URLSearchParams()
    if (sessionId) params.append('sessionId', sessionId)
    if (startDate) params.append('startDate', startDate)
    if (endDate) params.append('endDate', endDate)
    
    return makeApiCall(`/analytics/messages?${params.toString()}`)
  }, [makeApiCall])

  return {
    // State
    isLoading,
    error,
    
    // Conversation methods
    getConversations,
    getConversationMessages,
    sendMessage,
    sendDirectMessage,
    
    // Session methods
    getSessions,
    createSession,
    getSessionStatus,
    deleteSession,
    
    // Analytics methods
    getMessageAnalytics,
    
    // Utility
    makeApiCall
  }
}

export type { Conversation, Message, Lead, ConversationWithMessages }
