'use client'

import { useState, useEffect } from 'react'
import { Card } from '../../../components/ui/card'
import { Badge } from '../../../components/ui/badge'
import { 
  Smartphone, 
  MessageCircle, 
  Users, 
  TrendingUp, 
  Settings, 
  Plus,
  QrCode,
  Wifi,
  WifiOff,
  BarChart3,
  Bot,
  MessageSquare,
  Phone
} from 'lucide-react'

interface WhatsAppSession {
  id: string
  sessionId: string
  name: string
  status: 'connected' | 'connecting' | 'disconnected' | 'qr'
  lastSeen?: string
  qrCode?: string
}

interface WhatsAppStats {
  totalMessages: number
  inboundMessages: number
  outboundMessages: number
  activeConversations: number
  responseRate: string
  sessionsCount: number
}

export default function WhatsAppPage() {
  const [sessions, setSessions] = useState<WhatsAppSession[]>([])
  const [stats, setStats] = useState<WhatsAppStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showCreateSession, setShowCreateSession] = useState(false)

  useEffect(() => {
    loadWhatsAppData()
  }, [])

  const loadWhatsAppData = async () => {
    try {
      setIsLoading(true)
      
      // Fetch sessions
      const sessionsResponse = await fetch('/api/whatsapp/sessions')
      if (sessionsResponse.ok) {
        const sessionsData = await sessionsResponse.json()
        setSessions(sessionsData.sessions || [])
      }

      // Fetch analytics
      const analyticsResponse = await fetch('/api/whatsapp/analytics/messages')
      if (analyticsResponse.ok) {
        const analyticsData = await analyticsResponse.json()
        setStats({
          totalMessages: analyticsData.total.messages,
          inboundMessages: analyticsData.total.inbound,
          outboundMessages: analyticsData.total.outbound,
          activeConversations: analyticsData.total.conversations,
          responseRate: analyticsData.responseRate,
          sessionsCount: sessionsData?.sessions?.length || 0
        })
      }
    } catch (error) {
      console.error('Error loading WhatsApp data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected':
        return 'bg-green-500'
      case 'connecting':
        return 'bg-yellow-500'
      case 'qr':
        return 'bg-blue-500'
      default:
        return 'bg-gray-500'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected':
        return <Wifi className="h-4 w-4" />
      case 'connecting':
        return <Wifi className="h-4 w-4" />
      case 'qr':
        return <QrCode className="h-4 w-4" />
      default:
        return <WifiOff className="h-4 w-4" />
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">WhatsApp Business</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="p-6 animate-pulse">
              <div className="h-8 bg-gray-200 rounded mb-2"></div>
              <div className="h-10 bg-gray-200 rounded"></div>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">WhatsApp Business</h1>
          <p className="text-gray-500">Gestiona tus sesiones y conversaciones de WhatsApp</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowCreateSession(true)}
            className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Plus className="h-4 w-4 mr-2" />
            Nueva Sesión
          </button>
          <button
            onClick={loadWhatsAppData}
            className="flex items-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Settings className="h-4 w-4 mr-2" />
            Configurar
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="p-6">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-lg">
              <Smartphone className="h-6 w-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Sesiones Activas</p>
              <p className="text-2xl font-bold text-gray-900">
                {sessions.filter(s => s.status === 'connected').length}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <MessageCircle className="h-6 w-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Mensajes Totales</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.totalMessages || 0}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Users className="h-6 w-6 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Conversaciones</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.activeConversations || 0}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <TrendingUp className="h-6 w-6 text-yellow-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Tasa Respuesta</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.responseRate || '0%'}</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sessions Management */}
        <div className="lg:col-span-2">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-medium text-gray-900">Sesiones WhatsApp</h2>
              <Badge variant="outline">
                {sessions.length} sesiones
              </Badge>
            </div>

            <div className="space-y-4">
              {sessions.length > 0 ? (
                sessions.map((session) => (
                  <div key={session.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className={`w-3 h-3 rounded-full ${getStatusColor(session.status)}`}></div>
                      <div>
                        <p className="font-medium text-gray-900">{session.name || session.sessionId}</p>
                        <p className="text-sm text-gray-500">ID: {session.sessionId}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-3">
                      <Badge variant={session.status === 'connected' ? 'default' : 'secondary'}>
                        <span className="flex items-center">
                          {getStatusIcon(session.status)}
                          <span className="ml-1 capitalize">{session.status}</span>
                        </span>
                      </Badge>
                      
                      <div className="flex items-center space-x-2">
                        {session.status === 'qr' && (
                          <button className="text-blue-600 hover:text-blue-800">
                            <QrCode className="h-4 w-4" />
                          </button>
                        )}
                        <button className="text-gray-600 hover:text-gray-800">
                          <Settings className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12">
                  <Smartphone className="mx-auto h-12 w-12 text-gray-300 mb-4" />
                  <p className="text-gray-500 mb-2">No hay sesiones configuradas</p>
                  <p className="text-sm text-gray-400">Crea tu primera sesión de WhatsApp para empezar</p>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Acciones Rápidas</h3>
            <div className="space-y-3">
              <a
                href="/dashboard/whatsapp/conversations"
                className="flex items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <MessageSquare className="h-5 w-5 text-gray-600 mr-3" />
                <div>
                  <p className="font-medium text-gray-900">Ver Conversaciones</p>
                  <p className="text-sm text-gray-500">Gestionar chats activos</p>
                </div>
              </a>
              
              <a
                href="/dashboard/whatsapp/templates"
                className="flex items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Bot className="h-5 w-5 text-gray-600 mr-3" />
                <div>
                  <p className="font-medium text-gray-900">Plantillas</p>
                  <p className="text-sm text-gray-500">Configurar respuestas automáticas</p>
                </div>
              </a>
              
              <a
                href="/dashboard/whatsapp/analytics"
                className="flex items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <BarChart3 className="h-5 w-5 text-gray-600 mr-3" />
                <div>
                  <p className="font-medium text-gray-900">Analytics</p>
                  <p className="text-sm text-gray-500">Ver estadísticas detalladas</p>
                </div>
              </a>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Estado del Sistema</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Servicio WhatsApp</span>
                <Badge variant="default">
                  <Wifi className="h-3 w-3 mr-1" />
                  Online
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Automatización</span>
                <Badge variant="default">
                  <Bot className="h-3 w-3 mr-1" />
                  Activa
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Última sincronización</span>
                <span className="text-sm text-gray-500">{new Date().toLocaleTimeString()}</span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Message Distribution */}
      <Card className="p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-6">Distribución de Mensajes</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-3 h-3 bg-green-500 rounded-full mr-3"></div>
                <span className="text-sm text-gray-600">Mensajes Enviados</span>
              </div>
              <span className="font-medium">{stats?.outboundMessages || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-3 h-3 bg-blue-500 rounded-full mr-3"></div>
                <span className="text-sm text-gray-600">Mensajes Recibidos</span>
              </div>
              <span className="font-medium">{stats?.inboundMessages || 0}</span>
            </div>
          </div>
          
          <div className="text-center">
            <p className="text-3xl font-bold text-gray-900 mb-2">
              {stats?.totalMessages || 0}
            </p>
            <p className="text-sm text-gray-500">Total de mensajes procesados</p>
          </div>
        </div>
      </Card>
    </div>
  )
}
