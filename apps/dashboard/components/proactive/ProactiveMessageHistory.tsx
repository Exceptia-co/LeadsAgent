'use client'

import { useState, useEffect } from 'react'
import { getWhatsAppUrl } from '../../hooks/use-whatsapp-url'
import { Card } from '../ui/card'
import { Badge } from '../ui/badge'
import { 
  User, 
  CheckCircle, 
  Clock, 
  XCircle, 
  MessageSquare 
} from 'lucide-react'
import { Lead } from './ProactiveMessageSender'
import FloatingMessageFilter from './FloatingMessageFilter'

export interface ProactiveMessage {
  id: string
  leadId: string
  templateId?: string
  templateName?: string
  phoneNumber: string
  content: string
  status: 'pending' | 'sent' | 'delivered' | 'failed'
  sentAt?: string
  deliveredAt?: string
  errorMessage?: string
  createdAt: string
}

interface ProactiveMessageHistoryProps {
  leads: Lead[]
  onRefresh?: () => void
}

export default function ProactiveMessageHistory({ leads, onRefresh }: ProactiveMessageHistoryProps) {
  const [messages, setMessages] = useState<ProactiveMessage[]>([])
  const [filteredMessages, setFilteredMessages] = useState<ProactiveMessage[]>([])
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchMessages()
  }, [])

  useEffect(() => {
    // Filter messages by status
    const filtered = messages.filter(message => {
      if (statusFilter === 'all') return true
      return message.status === statusFilter
    })
    setFilteredMessages(filtered)
  }, [messages, statusFilter])

  const fetchMessages = async () => {
    setLoading(true)
    try {
      const response = await fetch(`${getWhatsAppUrl()}/proactive-messages`)
      const result = await response.json()
      
      if (result.success) {
        setMessages(result.data || [])
      }
    } catch (error) {
      console.error('Error fetching proactive messages:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = () => {
    fetchMessages()
    if (onRefresh) {
      onRefresh()
    }
  }

  const handleClearFilter = () => {
    setStatusFilter('all')
  }

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-64 bg-gray-200 rounded-lg"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-24">
      {/* Floating Message Filter */}
      <FloatingMessageFilter
        messages={messages}
        filteredMessages={filteredMessages}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        onClearFilter={handleClearFilter}
      />

      {/* Messages List */}
      <div className="space-y-4">
        {filteredMessages.map(message => {
          const lead = leads.find(l => l.id === message.leadId)
          return (
            <Card key={message.id} className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start space-x-4">
                  <div className="flex items-center justify-center w-10 h-10 bg-blue-100 rounded-full">
                    <User className="h-5 w-5 text-blue-600" />
                  </div>
                  
                  <div>
                    <h3 className="font-medium text-gray-900">{lead?.name || 'Lead desconocido'}</h3>
                    <p className="text-sm text-gray-600">{message.phoneNumber}</p>
                    {message.templateName && (
                      <p className="text-xs text-blue-600">Template: {message.templateName}</p>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  {message.status === 'pending' && <Clock className="h-4 w-4 text-yellow-500" />}
                  {message.status === 'sent' && <CheckCircle className="h-4 w-4 text-blue-500" />}
                  {message.status === 'delivered' && <CheckCircle className="h-4 w-4 text-green-500" />}
                  {message.status === 'failed' && <XCircle className="h-4 w-4 text-red-500" />}
                  <Badge variant={
                    message.status === 'delivered' ? 'default' :
                    message.status === 'sent' ? 'secondary' :
                    message.status === 'pending' ? 'outline' : 'destructive'
                  } className="text-xs">
                    {message.status === 'pending' ? 'Pendiente' :
                     message.status === 'sent' ? 'Enviado' :
                     message.status === 'delivered' ? 'Entregado' : 'Falló'}
                  </Badge>
                </div>
              </div>
              
              <div className="bg-gray-50 p-4 rounded-lg mb-4">
                <pre className="whitespace-pre-wrap text-sm text-gray-700">
                  {message.content}
                </pre>
              </div>
              
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>
                  Creado: {new Date(message.createdAt).toLocaleString('es-ES')}
                </span>
                
                {message.sentAt && (
                  <span>
                    Enviado: {new Date(message.sentAt).toLocaleString('es-ES')}
                  </span>
                )}
              </div>
              
              {message.errorMessage && (
                <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                  Error: {message.errorMessage}
                </div>
              )}
            </Card>
          )
        })}
      </div>

      {filteredMessages.length === 0 && (
        <Card className="p-12 text-center">
          <MessageSquare className="mx-auto h-12 w-12 text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No hay mensajes</h3>
          <p className="text-gray-500">
            {statusFilter !== 'all' 
              ? 'No hay mensajes con el estado seleccionado.'
              : 'No se han enviado mensajes proactivos aún.'
            }
          </p>
        </Card>
      )}
    </div>
  )
}
