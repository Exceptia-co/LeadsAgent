import { useState, useCallback } from 'react'

const WHATSAPP_API_BASE_URL = process.env.NEXT_PUBLIC_WHATSAPP_API_URL || 'http://localhost:3002'

interface ApiResponse<T = any> {
  data?: T
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

export function useWhatsAppApi() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const makeApiCall = useCallback(async <T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch(`${WHATSAPP_API_BASE_URL}/api${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      })

      if (!response.ok) {
        throw new Error(`API Error: ${response.statusText}`)
      }

      return await response.json()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred'
      setError(errorMessage)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Conversation methods
  const getConversations = useCallback(async (
    limit = 50,
    offset = 0
  ): Promise<Conversation[]> => {
    return makeApiCall(`/conversations?limit=${limit}&offset=${offset}`)
  }, [makeApiCall])

  const getConversationMessages = useCallback(async (
    conversationId: string,
    limit = 50,
    offset = 0
  ): Promise<ConversationWithMessages> => {
    return makeApiCall(`/conversations/${conversationId}/messages?limit=${limit}&offset=${offset}`)
  }, [makeApiCall])

  const sendMessage = useCallback(async (
    conversationId: string,
    sessionId: string,
    message: string,
    type: 'text' | 'image' | 'document' | 'audio' | 'video' = 'text'
  ): Promise<boolean> => {
    return makeApiCall(`/conversations/${conversationId}/send`, {
      method: 'POST',
      body: JSON.stringify({
        sessionId,
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
