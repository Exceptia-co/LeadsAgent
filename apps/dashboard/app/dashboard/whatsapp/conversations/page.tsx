'use client'

import { useState, useEffect, useRef } from 'react'
import { Card } from '../../../../components/ui/card'
import { Badge } from '../../../../components/ui/badge'
import { useWhatsAppApi, type Conversation, type Message, type ConversationWithMessages } from '../../../../hooks/use-whatsapp-api'
import { 
  MessageCircle, 
  Send, 
  Search, 
  Filter, 
  Phone, 
  MoreVertical,
  Paperclip,
  Smile,
  User,
  Clock,
  CheckCheck,
  ArrowLeft,
  AlertCircle
} from 'lucide-react'

interface ExtendedConversation extends Conversation {
  messages?: Message[]
}

export default function WhatsAppConversationsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<ExtendedConversation | null>(null)
  const [newMessage, setNewMessage] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [selectedConversationMessages, setSelectedConversationMessages] = useState<Message[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  const { 
    getConversations,
    getConversationMessages,
    sendMessage,
    getSessions,
    error: apiError
  } = useWhatsAppApi()

  useEffect(() => {
    loadConversations()
    loadDefaultSession()
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [selectedConversationMessages])

  useEffect(() => {
    if (selectedConversation) {
      loadConversationMessages(selectedConversation.id)
    }
  }, [selectedConversation])

  const loadDefaultSession = async () => {
    try {
      const sessions = await getSessions()
      if (sessions?.sessions && sessions.sessions.length > 0) {
        setCurrentSessionId(sessions.sessions[0].id)
      }
    } catch (error) {
      console.error('Error loading sessions:', error)
    }
  }

  const loadConversations = async () => {
    try {
      setIsLoading(true)
      const conversationData = await getConversations()
      setConversations(conversationData || [])
    } catch (error) {
      console.error('Error loading conversations:', error)
      // Show fallback message instead of empty state
    } finally {
      setIsLoading(false)
    }
  }

  const loadConversationMessages = async (conversationId: string) => {
    try {
      setLoadingMessages(true)
      const messageData = await getConversationMessages(conversationId)
      setSelectedConversationMessages(messageData.conversation.messages || [])
    } catch (error) {
      console.error('Error loading conversation messages:', error)
      setSelectedConversationMessages([])
    } finally {
      setLoadingMessages(false)
    }
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation || !currentSessionId) return

    const tempMessage: Message = {
      id: Date.now().toString(),
      content: newMessage,
      direction: 'OUTBOUND',
      messageType: 'text',
      status: 'sent',
      createdAt: new Date().toISOString()
    }

    // Update UI immediately (optimistic update)
    setSelectedConversationMessages(prev => [...prev, tempMessage])
    setNewMessage('')

    try {
      await sendMessage(selectedConversation.id, currentSessionId, newMessage)
      // Message was sent successfully, update status
      setSelectedConversationMessages(prev => 
        prev.map(msg => msg.id === tempMessage.id ? { ...msg, status: 'delivered' } : msg)
      )
    } catch (error) {
      console.error('Error sending message:', error)
      // Update message status to failed
      setSelectedConversationMessages(prev => 
        prev.map(msg => msg.id === tempMessage.id ? { ...msg, status: 'failed' } : msg)
      )
    }
  }

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (date.toDateString() === today.toDateString()) {
      return formatTime(timestamp)
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Ayer'
    } else {
      return date.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' })
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'sent':
        return <CheckCheck className="h-4 w-4 text-gray-400" />
      case 'delivered':
        return <CheckCheck className="h-4 w-4 text-gray-600" />
      case 'read':
        return <CheckCheck className="h-4 w-4 text-blue-600" />
      case 'failed':
        return <Clock className="h-4 w-4 text-red-600" />
      default:
        return null
    }
  }

  const getLeadStatusColor = (status: string) => {
    switch (status) {
      case 'HOT':
        return 'bg-red-100 text-red-800'
      case 'QUALIFIED':
        return 'bg-yellow-100 text-yellow-800'
      case 'COLD':
        return 'bg-blue-100 text-blue-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const filteredConversations = conversations.filter(conv =>
    conv.lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    conv.lead.phone.includes(searchTerm)
  )

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Conversaciones WhatsApp</h1>
        <div className="animate-pulse">
          <div className="h-64 bg-gray-200 rounded-lg"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Conversaciones WhatsApp</h1>
          <p className="text-gray-500">Gestiona las conversaciones activas con tus leads</p>
        </div>
        <div className="flex items-center space-x-2">
          {apiError && (
            <div className="flex items-center px-3 py-1 bg-red-100 text-red-700 rounded-lg text-sm">
              <AlertCircle className="h-4 w-4 mr-1" />
              Error de conexión
            </div>
          )}
          <button 
            className="p-2 text-gray-600 hover:text-gray-800"
            onClick={() => loadConversations()}
            title="Recargar conversaciones"
          >
            <Filter className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Conversations Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-200px)]">
        {/* Conversations List */}
        <Card className="lg:col-span-1 flex flex-col">
          {/* Search */}
          <div className="p-4 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                type="text"
                placeholder="Buscar conversaciones..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {/* Conversations */}
          <div className="flex-1 overflow-y-auto">
            {filteredConversations.length > 0 ? (
              filteredConversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className={`p-4 border-b cursor-pointer hover:bg-gray-50 transition-colors ${
                    selectedConversation?.id === conversation.id ? 'bg-blue-50 border-blue-200' : ''
                  }`}
                  onClick={() => setSelectedConversation(conversation)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center">
                      <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center mr-3">
                        <User className="h-5 w-5 text-gray-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{conversation.lead.name}</p>
                        <p className="text-sm text-gray-500">{conversation.lead.phone}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">{formatDate(conversation.updatedAt)}</p>
                      {conversation.unreadCount > 0 && (
                        <span className="inline-block w-5 h-5 bg-blue-600 text-white text-xs rounded-full text-center leading-5 mt-1">
                          {conversation.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-600 truncate flex-1 mr-2">
                      {conversation.lastMessage?.content || 'Sin mensajes'}
                    </p>
                    <Badge className={`text-xs ${getLeadStatusColor(conversation.lead.status)}`}>
                      {conversation.lead.status}
                    </Badge>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12">
                <MessageCircle className="mx-auto h-12 w-12 text-gray-300 mb-4" />
                <p className="text-gray-500">No hay conversaciones disponibles</p>
              </div>
            )}
          </div>
        </Card>

        {/* Chat Area */}
        <Card className="lg:col-span-2 flex flex-col">
          {selectedConversation ? (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b flex items-center justify-between">
                <div className="flex items-center">
                  <button 
                    className="lg:hidden mr-3 p-1 hover:bg-gray-100 rounded"
                    onClick={() => setSelectedConversation(null)}
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                  <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center mr-3">
                    <User className="h-5 w-5 text-gray-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{selectedConversation.lead.name}</p>
                    <div className="flex items-center space-x-2">
                      <p className="text-sm text-gray-500">{selectedConversation.lead.phone}</p>
                      <Badge className={`text-xs ${getLeadStatusColor(selectedConversation.lead.status)}`}>
                        {selectedConversation.lead.status}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button className="p-2 text-gray-600 hover:text-gray-800">
                    <Phone className="h-5 w-5" />
                  </button>
                  <button className="p-2 text-gray-600 hover:text-gray-800">
                    <MoreVertical className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {loadingMessages ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <span className="ml-2 text-gray-500">Cargando mensajes...</span>
                  </div>
                ) : selectedConversationMessages.length > 0 ? (
                  selectedConversationMessages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.direction === 'OUTBOUND' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                          message.direction === 'OUTBOUND'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 text-gray-900'
                        }`}
                      >
                        <p>{message.content}</p>
                        <div className={`flex items-center justify-end mt-1 space-x-1 ${
                          message.direction === 'OUTBOUND' ? 'text-blue-100' : 'text-gray-500'
                        }`}>
                          <span className="text-xs">{formatTime(message.createdAt)}</span>
                          {message.direction === 'OUTBOUND' && getStatusIcon(message.status)}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex items-center justify-center py-8">
                    <div className="text-center">
                      <MessageCircle className="mx-auto h-12 w-12 text-gray-300 mb-2" />
                      <p className="text-gray-500 text-sm">No hay mensajes en esta conversación</p>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input */}
              <div className="p-4 border-t">
                <div className="flex items-center space-x-2">
                  <button className="p-2 text-gray-600 hover:text-gray-800">
                    <Paperclip className="h-5 w-5" />
                  </button>
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      placeholder="Escribe un mensaje..."
                      className="w-full px-4 py-2 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                    />
                    <button className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 text-gray-600 hover:text-gray-800">
                      <Smile className="h-5 w-5" />
                    </button>
                  </div>
                  <button
                    onClick={handleSendMessage}
                    disabled={!newMessage.trim()}
                    className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageCircle className="mx-auto h-16 w-16 text-gray-300 mb-4" />
                <p className="text-gray-500 mb-2">Selecciona una conversación</p>
                <p className="text-sm text-gray-400">Elige una conversación para ver los mensajes</p>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
