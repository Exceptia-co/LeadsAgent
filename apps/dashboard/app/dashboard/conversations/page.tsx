'use client'

import { useState, useEffect } from 'react'
import { Card } from '../../../components/ui/card'
import { Badge } from '../../../components/ui/badge'
import { 
  MessageSquare, 
  Search, 
  Filter, 
  Clock, 
  Bot,
  Phone,
  TrendingUp,
  Users,
  Activity
} from 'lucide-react'

interface Conversation {
  id: string
  phoneNumber: string
  contactName?: string
  messageText?: string
  responseText?: string
  messageType: string
  aiProvider?: string
  isFromUser: boolean
  createdAt: string
  sessionId: string
}

interface ConversationStats {
  totalConversations: number
  uniqueContacts: number
  aiResponses: number
  averageTokens: number
}

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [stats, setStats] = useState<ConversationStats>({
    totalConversations: 0,
    uniqueContacts: 0,
    aiResponses: 0,
    averageTokens: 0
  })
  const [searchTerm, setSearchTerm] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSession, setSelectedSession] = useState<string>('')

  useEffect(() => {
    fetchConversations()
    fetchStats()
  }, [selectedSession])

  const fetchConversations = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/whatsapp/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          searchTerm: searchTerm || undefined,
          sessionId: selectedSession || undefined,
          limit: 50 
        })
      })
      
      if (!response.ok) throw new Error('Error fetching conversations')
      
      const data = await response.json()
      setConversations(data.conversations || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setIsLoading(false)
    }
  }

  const fetchStats = async () => {
    try {
      const response = await fetch(`/api/whatsapp/stats${selectedSession ? `?sessionId=${selectedSession}` : ''}`)
      if (response.ok) {
        const data = await response.json()
        setStats(data)
      }
    } catch (err) {
      console.warn('Could not fetch conversation stats:', err)
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    fetchConversations()
  }

  const formatPhoneNumber = (phone: string) => {
    // Remove WhatsApp suffix if present
    const cleanPhone = phone.replace('@c.us', '')
    return cleanPhone.startsWith('+') ? cleanPhone : `+${cleanPhone}`
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Conversaciones WhatsApp</h1>
        <div className="animate-pulse space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-200 rounded-lg"></div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Conversaciones WhatsApp</h1>
        <div className="flex items-center space-x-2 text-sm text-gray-500">
          <MessageSquare className="h-4 w-4" />
          <span>Historial de mensajes e interacciones</span>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <MessageSquare className="h-8 w-8 text-blue-500" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Total Mensajes</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.totalConversations}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Users className="h-8 w-8 text-green-500" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Contactos Únicos</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.uniqueContacts}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Bot className="h-8 w-8 text-purple-500" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Respuestas IA</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.aiResponses}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Activity className="h-8 w-8 text-orange-500" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Tokens Promedio</p>
              <p className="text-2xl font-semibold text-gray-900">{Math.round(stats.averageTokens)}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Search and Filters */}
      <Card className="p-4">
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              placeholder="Buscar por número, contacto o mensaje..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select
            value={selectedSession}
            onChange={(e) => setSelectedSession(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Todas las sesiones</option>
            <option value="default">Sesión por defecto</option>
          </select>
          <button
            type="submit"
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Search className="h-4 w-4 mr-2" />
            Buscar
          </button>
        </form>
      </Card>

      {/* Error State */}
      {error && (
        <Card className="p-4">
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <p className="text-red-800">Error: {error}</p>
            <button 
              onClick={fetchConversations}
              className="mt-2 text-red-600 hover:text-red-800 underline"
            >
              Reintentar
            </button>
          </div>
        </Card>
      )}

      {/* Conversations List */}
      <Card>
        <div className="overflow-hidden">
          <div className="bg-gray-50 px-6 py-3 border-b">
            <h3 className="text-lg font-medium text-gray-900">
              Historial de Conversaciones
            </h3>
          </div>
          
          <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
            {conversations.length > 0 ? (
              conversations.map((conversation) => (
                <div key={conversation.id} className="p-6 hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3 flex-1">
                      <div className="flex-shrink-0">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                          conversation.isFromUser ? 'bg-blue-100' : 'bg-green-100'
                        }`}>
                          {conversation.isFromUser ? (
                            <Phone className="h-4 w-4 text-blue-600" />
                          ) : (
                            <Bot className="h-4 w-4 text-green-600" />
                          )}
                        </div>
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-1">
                          <p className="text-sm font-medium text-gray-900">
                            {conversation.contactName || formatPhoneNumber(conversation.phoneNumber)}
                          </p>
                          <Badge variant={conversation.isFromUser ? "secondary" : "default"}>
                            {conversation.isFromUser ? 'Recibido' : 'Enviado'}
                          </Badge>
                          {conversation.aiProvider && (
                            <Badge variant="outline" className="text-xs">
                              IA: {conversation.aiProvider}
                            </Badge>
                          )}
                        </div>
                        
                        <div className="space-y-1">
                          {conversation.messageText && (
                            <p className="text-sm text-gray-600 bg-gray-100 p-2 rounded">
                              <strong>Mensaje:</strong> {conversation.messageText}
                            </p>
                          )}
                          {conversation.responseText && (
                            <p className="text-sm text-gray-600 bg-blue-50 p-2 rounded">
                              <strong>Respuesta IA:</strong> {conversation.responseText}
                            </p>
                          )}
                        </div>
                        
                        <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                          <span className="flex items-center">
                            <Clock className="h-3 w-3 mr-1" />
                            {formatDate(conversation.createdAt)}
                          </span>
                          <span>Tipo: {conversation.messageType}</span>
                          <span>Sesión: {conversation.sessionId}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-12 text-center">
                <MessageSquare className="mx-auto h-12 w-12 text-gray-300 mb-4" />
                <p className="text-gray-500">
                  {searchTerm ? 'No se encontraron conversaciones con ese criterio' : 'No hay conversaciones disponibles'}
                </p>
                {!searchTerm && (
                  <p className="text-sm text-gray-400 mt-2">
                    Las conversaciones aparecerán aquí cuando se envíen mensajes a través de WhatsApp
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}
