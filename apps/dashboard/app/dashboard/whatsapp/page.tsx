'use client'

import { useState, useEffect } from 'react'
import { Card } from '../../../components/ui/card'
import { Badge } from '../../../components/ui/badge'
import { useWhatsAppApi } from '../../../hooks/use-whatsapp-api'
import { WhatsAppSession, WhatsAppMessage } from '../../../types'
import { LeadSelector } from '../../../components/LeadSelector'
import { Lead } from '../../../hooks/use-leads'
import { 
  Smartphone, 
  Plus, 
  Trash2, 
  Send, 
  MessageSquare, 
  Activity,
  QrCode,
  Phone,
  Clock,
  AlertCircle,
  CheckCircle2
} from 'lucide-react'
import WhatsAppConversations from '../../../components/WhatsAppConversations'

// Status variants for sessions
const SESSION_STATUS_VARIANTS = {
  DISCONNECTED: 'destructive' as const,
  CONNECTING: 'warning' as const,
  CONNECTED: 'success' as const,
  QR_READY: 'secondary' as const
}

const SESSION_STATUS_LABELS = {
  DISCONNECTED: 'Desconectado',
  CONNECTING: 'Conectando',
  CONNECTED: 'Conectado',
  QR_READY: 'QR Listo'
}

export default function WhatsAppPage() {
  const [activeTab, setActiveTab] = useState<'sessions' | 'send' | 'messages' | 'conversations'>('sessions')
  const [sessions, setSessions] = useState<WhatsAppSession[]>([])
  const [messages, setMessages] = useState<WhatsAppMessage[]>([])
  const [selectedSession, setSelectedSession] = useState<string>('')
  
  const { 
    getSessions, 
    createSession, 
    deleteSession, 
    sendDirectMessage,
    getMessageAnalytics,
    isLoading, 
    error 
  } = useWhatsAppApi()

  // Load sessions on component mount
  useEffect(() => {
    loadSessions()
  }, [])

  const loadSessions = async () => {
    try {
      const data = await getSessions() as { sessions?: WhatsAppSession[] }
      setSessions(data.sessions || [])
      if (data.sessions && data.sessions.length > 0 && !selectedSession) {
        setSelectedSession(data.sessions[0].id)
      }
    } catch (err) {
      console.error('Error loading sessions:', err)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">WhatsApp Manager</h1>
        <div className="flex items-center space-x-2">
          <Activity className="h-5 w-5 text-green-500" />
          <span className="text-sm text-gray-600">
            {sessions.filter(s => s.status === 'CONNECTED').length} sesiones conectadas
          </span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'sessions', label: 'Sesiones', icon: Smartphone },
            { id: 'conversations', label: 'Conversaciones', icon: MessageSquare },
            { id: 'send', label: 'Enviar Mensaje', icon: Send },
            { id: 'messages', label: 'Historial', icon: MessageSquare }
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as any)}
              className={`flex items-center py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Icon className="h-4 w-4 mr-2" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'sessions' && (
        <SessionManager 
          sessions={sessions}
          onSessionsChange={loadSessions}
          createSession={createSession}
          deleteSession={deleteSession}
          isLoading={isLoading}
          error={error}
        />
      )}

      {activeTab === 'send' && (
        <SendMessage 
          sessions={sessions}
          selectedSession={selectedSession}
          setSelectedSession={setSelectedSession}
          sendDirectMessage={sendDirectMessage}
          isLoading={isLoading}
          error={error}
        />
      )}

      {activeTab === 'conversations' && (
        <WhatsAppConversations />
      )}

      {activeTab === 'messages' && (
        <MessageHistory 
          sessions={sessions}
          selectedSession={selectedSession}
          setSelectedSession={setSelectedSession}
          getMessageAnalytics={getMessageAnalytics}
          isLoading={isLoading}
          error={error}
        />
      )}
    </div>
  )
}

// Session Manager Component
function SessionManager({ 
  sessions, 
  onSessionsChange, 
  createSession, 
  deleteSession, 
  isLoading, 
  error 
}: {
  sessions: WhatsAppSession[]
  onSessionsChange: () => void
  createSession: (id: string, name?: string) => Promise<any>
  deleteSession: (id: string) => Promise<any>
  isLoading: boolean
  error: string | null
}) {
  const [newSessionId, setNewSessionId] = useState('')
  const [newSessionName, setNewSessionName] = useState('')
  const [creating, setCreating] = useState(false)

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newSessionId.trim()) return

    setCreating(true)
    try {
      await createSession(newSessionId.trim(), newSessionName.trim() || undefined)
      setNewSessionId('')
      setNewSessionName('')
      onSessionsChange()
    } catch (err) {
      console.error('Error creating session:', err)
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteSession = async (sessionId: string) => {
    if (!confirm('¿Estás seguro de que quieres eliminar esta sesión?')) return
    
    try {
      await deleteSession(sessionId)
      onSessionsChange()
    } catch (err) {
      console.error('Error deleting session:', err)
    }
  }

  return (
    <div className="space-y-6">
      {/* Create New Session */}
      <Card className="p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">
          <Plus className="inline h-5 w-5 mr-2" />
          Crear Nueva Sesión
        </h2>
        <form onSubmit={handleCreateSession} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Session ID *
              </label>
              <input
                type="text"
                value={newSessionId}
                onChange={(e) => setNewSessionId(e.target.value)}
                placeholder="ej: leadcrm-main"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre (Opcional)
              </label>
              <input
                type="text"
                value={newSessionName}
                onChange={(e) => setNewSessionName(e.target.value)}
                placeholder="ej: Sesión Principal"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={creating || !newSessionId.trim()}
            className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            <Plus className="h-4 w-4 mr-2" />
            {creating ? 'Creando...' : 'Crear Sesión'}
          </button>
        </form>
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <p className="text-sm text-blue-800">
            <QrCode className="inline h-4 w-4 mr-1" />
            Al crear una sesión, se abrirá Chrome para escanear el código QR de WhatsApp.
          </p>
        </div>
      </Card>

      {/* Existing Sessions */}
      <Card className="p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">
          <Smartphone className="inline h-5 w-5 mr-2" />
          Sesiones Activas ({sessions.length})
        </h2>
        
        {sessions.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Smartphone className="mx-auto h-12 w-12 text-gray-300 mb-4" />
            <p>No hay sesiones creadas</p>
            <p className="text-sm">Crea tu primera sesión para comenzar</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sessions.map((session) => (
              <div key={session.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-medium text-gray-900">{session.name || session.id}</h3>
                    <p className="text-sm text-gray-500">{session.id}</p>
                  </div>
                  <Badge variant={SESSION_STATUS_VARIANTS[session.status]}>
                    {SESSION_STATUS_LABELS[session.status]}
                  </Badge>
                </div>
                
                <div className="space-y-2 text-sm text-gray-600">
                  {session.phoneNumber && (
                    <div className="flex items-center">
                      <Phone className="h-4 w-4 mr-2" />
                      {session.phoneNumber}
                    </div>
                  )}
                  <div className="flex items-center">
                    <Clock className="h-4 w-4 mr-2" />
                    {new Date(session.updatedAt).toLocaleString('es-ES')}
                  </div>
                  {session.lastSeen && (
                    <div className="flex items-center">
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Último contacto: {new Date(session.lastSeen).toLocaleString('es-ES')}
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-gray-100">
                  <button
                    onClick={() => handleDeleteSession(session.id)}
                    className="text-red-600 hover:text-red-800 text-sm flex items-center"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

// Send Message Component
function SendMessage({ 
  sessions, 
  selectedSession, 
  setSelectedSession, 
  sendDirectMessage,
  isLoading,
  error 
}: {
  sessions: WhatsAppSession[]
  selectedSession: string
  setSelectedSession: (id: string) => void
  sendDirectMessage: (sessionId: string, phone: string, message: string) => Promise<boolean>
  isLoading: boolean
  error: string | null
}) {
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [success, setSuccess] = useState(false)
  const [useManualInput, setUseManualInput] = useState(false)

  const connectedSessions = sessions.filter(s => s.status === 'CONNECTED' || s.status === 'CONNECTING')

  const handleLeadSelect = (lead: Lead) => {
    setSelectedLead(lead)
    if (lead.id === 'manual') {
      setUseManualInput(true)
      setPhone('')
    } else {
      setUseManualInput(false)
      setPhone(lead.phone)
    }
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSession || !phone.trim() || !message.trim()) return

    setSending(true)
    setSuccess(false)
    try {
      await sendDirectMessage(selectedSession, phone.trim(), message.trim())
      setPhone('')
      setMessage('')
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      console.error('Error sending message:', err)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">
          <Send className="inline h-5 w-5 mr-2" />
          Enviar Mensaje Directo
        </h2>

        {connectedSessions.length === 0 ? (
          <div className="text-center py-8">
            <AlertCircle className="mx-auto h-12 w-12 text-orange-500 mb-4" />
            <p className="text-gray-900 font-medium">No hay sesiones conectadas</p>
            <p className="text-sm text-gray-500 mt-1">
              Crea y conecta una sesión primero en la pestaña "Sesiones"
            </p>
          </div>
        ) : (
          <form onSubmit={handleSendMessage} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sesión
              </label>
              <select
                value={selectedSession}
                onChange={(e) => setSelectedSession(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Seleccionar sesión...</option>
                {connectedSessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.name || session.id} ({session.phoneNumber})
                  </option>
                ))}
              </select>
            </div>

            {/* Lead Selector */}
            <LeadSelector
              selectedLead={selectedLead}
              onSelectLead={handleLeadSelect}
            />
            
            {/* Manual phone input (only shown if manual input is selected) */}
            {useManualInput && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Número de Teléfono
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+34658333517"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Incluye el código de país (ej: +34 para España)
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Mensaje
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                placeholder="Escribe tu mensaje aquí..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            {success && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                <p className="text-green-800 text-sm flex items-center">
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Mensaje enviado correctamente
                </p>
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-red-800 text-sm flex items-center">
                  <AlertCircle className="h-4 w-4 mr-2" />
                  {error}
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={sending || !selectedSession || !phone.trim() || !message.trim()}
              className="w-full bg-green-500 text-white px-4 py-2 rounded-md hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              <Send className="h-4 w-4 mr-2" />
              {sending ? 'Enviando...' : 'Enviar Mensaje'}
            </button>
          </form>
        )}
      </Card>
    </div>
  )
}

// Message History Component
function MessageHistory({ 
  sessions, 
  selectedSession, 
  setSelectedSession, 
  getMessageAnalytics,
  isLoading,
  error 
}: {
  sessions: WhatsAppSession[]
  selectedSession: string
  setSelectedSession: (id: string) => void
  getMessageAnalytics: (sessionId?: string, startDate?: string, endDate?: string) => Promise<any>
  isLoading: boolean
  error: string | null
}) {
  const [analytics, setAnalytics] = useState<any>(null)
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  })

  const loadAnalytics = async () => {
    try {
      const data = await getMessageAnalytics(
        selectedSession || undefined,
        dateRange.startDate,
        dateRange.endDate
      )
      setAnalytics(data)
    } catch (err) {
      console.error('Error loading analytics:', err)
    }
  }

  useEffect(() => {
    if (sessions.length > 0) {
      loadAnalytics()
    }
  }, [selectedSession, dateRange])

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card className="p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">
          <MessageSquare className="inline h-5 w-5 mr-2" />
          Historial de Mensajes
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Sesión
            </label>
            <select
              value={selectedSession}
              onChange={(e) => setSelectedSession(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todas las sesiones</option>
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.name || session.id}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fecha Inicio
            </label>
            <input
              type="date"
              value={dateRange.startDate}
              onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fecha Fin
            </label>
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </Card>

      {/* Analytics */}
      {analytics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="p-6">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Send className="h-6 w-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Enviados</p>
                <p className="text-2xl font-bold text-gray-900">{analytics.totalSent || 0}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg">
                <MessageSquare className="h-6 w-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Recibidos</p>
                <p className="text-2xl font-bold text-gray-900">{analytics.totalReceived || 0}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Phone className="h-6 w-6 text-purple-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Contactos</p>
                <p className="text-2xl font-bold text-gray-900">{analytics.topContacts?.length || 0}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <Activity className="h-6 w-6 text-yellow-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Total</p>
                <p className="text-2xl font-bold text-gray-900">
                  {(analytics.totalSent || 0) + (analytics.totalReceived || 0)}
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Top Contacts */}
      {analytics?.topContacts && analytics.topContacts.length > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Contactos Principales
          </h3>
          <div className="space-y-3">
            {analytics.topContacts.map((contact: any, index: number) => (
              <div key={contact.phone} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div>
                  <p className="font-medium text-gray-900">{contact.phone}</p>
                  <p className="text-sm text-gray-500 truncate max-w-xs">
                    {contact.lastMessage}
                  </p>
                </div>
                <div className="text-right">
                  <Badge variant="secondary">
                    {contact.count} mensajes
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
