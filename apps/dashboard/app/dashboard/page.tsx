'use client'

import { Card } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { useLeadStats, useLeads } from '../../lib/api'
import { STATUS_LABELS, STATUS_VARIANTS, type Lead } from '../../types'
import { Users, TrendingUp, MessageSquare, Target } from 'lucide-react'

export default function DashboardPage() {
  const { stats, isLoading: statsLoading, isError: statsError } = useLeadStats()
  const { leads, isLoading: leadsLoading, pagination } = useLeads(1, 5)

  if (statsLoading || leadsLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
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

  if (statsError) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-800">Error al cargar las estadísticas. Verifica que el servidor backend esté funcionando.</p>
        </div>
      </div>
    )
  }

  const totalLeads = stats?.total || 0
  const averageScore = stats?.averageScore || 0
  const byStatus = stats?.byStatus || {}

  // Calcular métricas adicionales
  const newLeads = byStatus['NEW'] || 0
  const convertedLeads = byStatus['CONVERTED'] || 0
  const conversionRate = totalLeads > 0 ? (convertedLeads / totalLeads * 100) : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <div className="text-sm text-gray-500">
          Última actualización: {new Date().toLocaleTimeString('es-ES')}
        </div>
      </div>

      {/* Métricas principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="p-6">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Total Leads</p>
              <p className="text-2xl font-bold text-gray-900">{totalLeads}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-lg">
              <TrendingUp className="h-6 w-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Tasa Conversión</p>
              <p className="text-2xl font-bold text-gray-900">{conversionRate.toFixed(1)}%</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <Target className="h-6 w-6 text-yellow-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Score Promedio</p>
              <p className="text-2xl font-bold text-gray-900">{averageScore.toFixed(1)}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center">
            <div className="p-2 bg-purple-100 rounded-lg">
              <MessageSquare className="h-6 w-6 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Nuevos Leads</p>
              <p className="text-2xl font-bold text-gray-900">{newLeads}</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Distribución por estado */}
        <Card className="p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Leads por Estado</h2>
          <div className="space-y-3">
            {Object.entries(STATUS_LABELS).map(([status, label]) => {
              const count = byStatus[status as keyof typeof byStatus] || 0
              const percentage = totalLeads > 0 ? (count / totalLeads * 100) : 0
              return (
                <div key={status} className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Badge variant={STATUS_VARIANTS[status as keyof typeof STATUS_VARIANTS]}>
                      {label}
                    </Badge>
                    <span className="ml-2 text-sm text-gray-600">
                      {count} leads
                    </span>
                  </div>
                  <div className="text-sm text-gray-500">
                    {percentage.toFixed(1)}%
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Leads recientes */}
        <Card className="p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Leads Recientes</h2>
          <div className="space-y-3">
            {leads.length > 0 ? (
              leads.map((lead: Lead) => (
                <div key={lead.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div>
                    <p className="font-medium text-gray-900">{lead.name}</p>
                    <p className="text-sm text-gray-500">{lead.phone}</p>
                  </div>
                  <div className="text-right">
                    <Badge variant={STATUS_VARIANTS[lead.status]}>
                      {STATUS_LABELS[lead.status]}
                    </Badge>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(lead.createdAt).toLocaleDateString('es-ES')}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Users className="mx-auto h-12 w-12 text-gray-300 mb-4" />
                <p>No hay leads disponibles</p>
                <p className="text-sm">Los nuevos leads aparecerán aquí</p>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Acciones rápidas */}
      <Card className="p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Acciones Rápidas</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <a
            href="/dashboard/leads"
            className="flex items-center justify-center px-4 py-6 border border-gray-300 rounded-lg hover:border-gray-400 transition-colors"
          >
            <Users className="h-6 w-6 text-gray-600 mr-2" />
            <span className="font-medium text-gray-900">Ver todos los leads</span>
          </a>
          <a
            href="/dashboard/whatsapp/conversations"
            className="flex items-center justify-center px-4 py-6 border border-gray-300 rounded-lg hover:border-gray-400 transition-colors"
          >
            <MessageSquare className="h-6 w-6 text-gray-600 mr-2" />
            <span className="font-medium text-gray-900">Ver conversaciones</span>
          </a>
          <a
            href="/dashboard/whatsapp"
            className="flex items-center justify-center px-4 py-6 border border-gray-300 rounded-lg hover:border-gray-400 transition-colors"
          >
            <Target className="h-6 w-6 text-gray-600 mr-2" />
            <span className="font-medium text-gray-900">Configurar WhatsApp</span>
          </a>
        </div>
      </Card>
    </div>
  )
}
