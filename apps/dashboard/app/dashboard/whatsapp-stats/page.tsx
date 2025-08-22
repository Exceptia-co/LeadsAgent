'use client'

import { useState, useEffect } from 'react'
import { Card } from '../../../components/ui/card'
import { Badge } from '../../../components/ui/badge'
import { 
  Shield, 
  CheckCircle, 
  XCircle, 
  Users,
  MessageSquare,
  Activity,
  Calendar,
  Eye,
  Filter,
  Download
} from 'lucide-react'

interface WhitelistStats {
  totalDecisions: number
  allowedCount: number
  blockedCount: number
  allowedPercentage: string
  blockedPercentage: string
  uniquePhones: number
}

interface WhitelistLog {
  id: string
  phoneNumber: string
  sessionId: string
  decision: 'ALLOWED' | 'BLOCKED'
  reason: string
  leadId?: string
  leadName?: string
  messagePreview?: string
  aiProvider?: string
  ipAddress?: string
  createdAt: string
}

export default function WhatsAppStatsPage() {
  const [stats, setStats] = useState<WhitelistStats>({
    totalDecisions: 0,
    allowedCount: 0,
    blockedCount: 0,
    allowedPercentage: '0',
    blockedPercentage: '0',
    uniquePhones: 0
  })
  const [logs, setLogs] = useState<WhitelistLog[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedDecision, setSelectedDecision] = useState<string>('')
  const [dateRange, setDateRange] = useState<string>('')

  useEffect(() => {
    fetchStats()
    fetchLogs()
  }, [selectedDecision, dateRange])

  const fetchStats = async () => {
    try {
      const params = new URLSearchParams()
      if (dateRange === '24h') {
        params.set('startDate', new Date(Date.now() - 24*60*60*1000).toISOString())
      } else if (dateRange === '7d') {
        params.set('startDate', new Date(Date.now() - 7*24*60*60*1000).toISOString())
      } else if (dateRange === '30d') {
        params.set('startDate', new Date(Date.now() - 30*24*60*60*1000).toISOString())
      }

      const response = await fetch(`/api/stats/whitelist?${params}`)
      if (response.ok) {
        const data = await response.json()
        setStats(data)
      }
    } catch (err) {
      console.warn('Could not fetch whitelist stats:', err)
    }
  }

  const fetchLogs = async () => {
    try {
      setIsLoading(true)
      const params = new URLSearchParams()
      params.set('limit', '50')
      if (selectedDecision) {
        params.set('decision', selectedDecision)
      }
      if (dateRange === '24h') {
        params.set('startDate', new Date(Date.now() - 24*60*60*1000).toISOString())
      } else if (dateRange === '7d') {
        params.set('startDate', new Date(Date.now() - 7*24*60*60*1000).toISOString())
      } else if (dateRange === '30d') {
        params.set('startDate', new Date(Date.now() - 30*24*60*60*1000).toISOString())
      }

      const response = await fetch(`/api/logs/whitelist?${params}`)
      if (!response.ok) throw new Error('Error fetching logs')
      
      const result = await response.json()
      setLogs(result.data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setIsLoading(false)
    }
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

  const formatPhoneNumber = (phone: string) => {
    return phone.startsWith('+') ? phone : `+${phone}`
  }

  if (isLoading && logs.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Estadísticas WhatsApp IA</h1>
        <div className="animate-pulse space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Estadísticas WhatsApp IA</h1>
        <div className="flex items-center space-x-2 text-sm text-gray-500">
          <Shield className="h-4 w-4" />
          <span>Sistema de autorización inteligente</span>
        </div>
      </div>

      {/* Filter Controls */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Filtrar por decisión:
            </label>
            <select
              value={selectedDecision}
              onChange={(e) => setSelectedDecision(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Todas las decisiones</option>
              <option value="ALLOWED">Solo permitidas</option>
              <option value="BLOCKED">Solo bloqueadas</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Rango de fechas:
            </label>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Todo el tiempo</option>
              <option value="24h">Últimas 24 horas</option>
              <option value="7d">Últimos 7 días</option>
              <option value="30d">Últimos 30 días</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Activity className="h-8 w-8 text-blue-500" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Total Decisiones</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.totalDecisions}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Permitidas</p>
              <p className="text-2xl font-semibold text-green-600">
                {stats.allowedCount} ({stats.allowedPercentage}%)
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <XCircle className="h-8 w-8 text-red-500" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Bloqueadas</p>
              <p className="text-2xl font-semibold text-red-600">
                {stats.blockedCount} ({stats.blockedPercentage}%)
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Users className="h-8 w-8 text-purple-500" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Números Únicos</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.uniquePhones}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Logs Table */}
      <Card>
        <div className="overflow-hidden">
          <div className="bg-gray-50 px-6 py-3 border-b flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900">
              Registro de Decisiones
            </h3>
            <span className="text-sm text-gray-500">
              {logs.length} registros encontrados
            </span>
          </div>
          
          {error && (
            <div className="p-4 bg-red-50 border-b border-red-200">
              <p className="text-red-800">Error: {error}</p>
              <button 
                onClick={fetchLogs}
                className="mt-2 text-red-600 hover:text-red-800 underline"
              >
                Reintentar
              </button>
            </div>
          )}
          
          <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
            {logs.length > 0 ? (
              logs.map((log) => (
                <div key={log.id} className="p-6 hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3 flex-1">
                      <div className="flex-shrink-0">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                          log.decision === 'ALLOWED' ? 'bg-green-100' : 'bg-red-100'
                        }`}>
                          {log.decision === 'ALLOWED' ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-600" />
                          )}
                        </div>
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-1">
                          <p className="text-sm font-medium text-gray-900">
                            {formatPhoneNumber(log.phoneNumber)}
                          </p>
                          <Badge variant={log.decision === 'ALLOWED' ? "default" : "destructive"}>
                            {log.decision === 'ALLOWED' ? 'Permitido' : 'Bloqueado'}
                          </Badge>
                          {log.leadName && (
                            <Badge variant="outline" className="text-xs">
                              Lead: {log.leadName}
                            </Badge>
                          )}
                        </div>
                        
                        <p className="text-sm text-gray-600 mb-2">
                          <strong>Razón:</strong> {log.reason}
                        </p>
                        
                        {log.messagePreview && (
                          <div className="text-sm text-gray-600 bg-gray-100 p-2 rounded mb-2">
                            <strong>Vista previa:</strong> {log.messagePreview}
                          </div>
                        )}
                        
                        <div className="flex items-center space-x-4 text-xs text-gray-500">
                          <span className="flex items-center">
                            <Calendar className="h-3 w-3 mr-1" />
                            {formatDate(log.createdAt)}
                          </span>
                          <span>Sesión: {log.sessionId}</span>
                          {log.aiProvider && (
                            <span>IA: {log.aiProvider}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-12 text-center">
                <Shield className="mx-auto h-12 w-12 text-gray-300 mb-4" />
                <p className="text-gray-500">
                  {selectedDecision || dateRange 
                    ? 'No se encontraron registros con los filtros seleccionados' 
                    : 'No hay registros de decisiones aún'}
                </p>
                {!(selectedDecision || dateRange) && (
                  <p className="text-sm text-gray-400 mt-2">
                    Los registros aparecerán aquí cuando se reciban mensajes de WhatsApp
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
