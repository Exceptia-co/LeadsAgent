'use client'

import { useState, useEffect } from 'react'
import { Badge } from '../ui/badge'
import { Filter, MessageSquare, X, RefreshCw } from 'lucide-react'
import { ProactiveMessage } from './ProactiveMessageHistory'

interface FloatingMessageFilterProps {
  messages: ProactiveMessage[]
  filteredMessages: ProactiveMessage[]
  statusFilter: string
  onStatusFilterChange: (status: string) => void
  onClearFilter: () => void
  isLoading?: boolean
}

const STATUS_LABELS = {
  all: 'Todos los estados',
  pending: 'Pendientes',
  sent: 'Enviados',
  delivered: 'Entregados',
  failed: 'Fallidos'
} as const

const STATUS_COLORS = {
  pending: 'bg-yellow-100 text-yellow-800',
  sent: 'bg-blue-100 text-blue-800',
  delivered: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800'
} as const

export default function FloatingMessageFilter({
  messages,
  filteredMessages,
  statusFilter,
  onStatusFilterChange,
  onClearFilter,
  isLoading = false
}: FloatingMessageFilterProps) {
  const [isChanging, setIsChanging] = useState(false)
  const [previousFilter, setPreviousFilter] = useState(statusFilter)

  // Efecto para detectar cambios de filtro
  useEffect(() => {
    if (previousFilter !== statusFilter) {
      setIsChanging(true)
      setPreviousFilter(statusFilter)
      const timer = setTimeout(() => {
        setIsChanging(false)
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [statusFilter, previousFilter])

  // Solo mostrar el banner si hay mensajes para filtrar
  if (messages.length === 0) return null

  const hasActiveFilter = statusFilter !== 'all'
  const totalMessages = messages.length
  const filteredCount = filteredMessages.length

  const handleFilterChange = (newFilter: string) => {
    setIsChanging(true)
    onStatusFilterChange(newFilter)
  }

  const handleClearWithEffect = () => {
    setIsChanging(true)
    onClearFilter()
  }

  return (
    <div 
      className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 px-4 w-full max-w-4xl"
      role="region"
      aria-label="Filtros de mensajes"
    >
      <div className="bg-white rounded-full shadow-2xl border border-gray-200 px-4 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-4 animate-in slide-in-from-bottom-2 fade-in duration-300">
        {/* Contador de mensajes */}
        <div className="flex items-center space-x-2 text-gray-700">
          <div className="flex items-center justify-center w-6 h-6 bg-blue-100 rounded-full">
            {(isLoading || isChanging) ? (
              <RefreshCw className="h-3 w-3 text-blue-600 animate-spin" />
            ) : (
              <MessageSquare className="h-3 w-3 text-blue-600" />
            )}
          </div>
          <span className={`text-sm font-medium whitespace-nowrap transition-all duration-300 ${
            isChanging ? 'opacity-70 transform scale-95' : 'opacity-100 transform scale-100'
          }`}>
            {hasActiveFilter ? (
              <>
                <span className="text-blue-600 font-semibold">{filteredCount}</span>
                <span className="text-gray-500"> de {totalMessages}</span>
              </>
            ) : (
              `${totalMessages} mensaje${totalMessages === 1 ? '' : 's'}`
            )}
          </span>
          {/* Badge del filtro activo */}
          {hasActiveFilter && (
            <Badge 
              className={`text-xs px-2 py-1 ml-2 transition-all duration-300 animate-in slide-in-from-left-1 ${
                statusFilter in STATUS_COLORS 
                  ? STATUS_COLORS[statusFilter as keyof typeof STATUS_COLORS]
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              {STATUS_LABELS[statusFilter as keyof typeof STATUS_LABELS]}
            </Badge>
          )}
        </div>
        
        {/* Separador vertical (solo en desktop) */}
        <div className="hidden sm:block h-6 w-px bg-gray-200"></div>
        
        {/* Dropdown de filtros */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <Filter className="h-4 w-4 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => onStatusFilterChange(e.target.value)}
              className="text-sm border-0 bg-transparent focus:ring-2 focus:ring-blue-500 focus:ring-opacity-20 focus:outline-none cursor-pointer text-gray-700 font-medium rounded px-1 py-1"
              aria-label="Filtrar mensajes por estado"
            >
              <option value="all">Todos</option>
              <option value="pending">Pendientes</option>
              <option value="sent">Enviados</option>
              <option value="delivered">Entregados</option>
              <option value="failed">Fallidos</option>
            </select>
          </div>
          
          {/* Botón limpiar filtros */}
          {hasActiveFilter && (
            <>
              <div className="hidden sm:block h-4 w-px bg-gray-200"></div>
              <button
                onClick={onClearFilter}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-20"
                title="Limpiar filtros"
                aria-label="Limpiar filtros"
              >
                <X className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
