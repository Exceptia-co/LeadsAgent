'use client'

import { Badge } from '../ui/badge'
import { Users, Send, X } from 'lucide-react'

interface FloatingLeadSelectionBannerProps {
  selectedCount: number
  totalLeads: number
  onSendBulkMessage: () => void
  onClearSelection: () => void
  isLoading?: boolean
}

export default function FloatingLeadSelectionBanner({
  selectedCount,
  totalLeads,
  onSendBulkMessage,
  onClearSelection,
  isLoading = false
}: FloatingLeadSelectionBannerProps) {
  // Solo mostrar el banner si hay leads seleccionados
  if (selectedCount === 0) return null

  return (
    <div 
      className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 px-4 w-full max-w-4xl"
      role="region"
      aria-label="Acciones de leads seleccionados"
    >
      <div className="bg-white rounded-full shadow-2xl border border-gray-200 px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center space-y-3 sm:space-y-0 sm:space-x-4 animate-in slide-in-from-bottom-2 fade-in duration-300">
        {/* Contador de leads seleccionados */}
        <div className="flex items-center space-x-2 text-gray-700">
          <div className="flex items-center justify-center w-8 h-8 bg-blue-100 rounded-full">
            <span className="text-sm font-bold text-blue-600">{selectedCount}</span>
          </div>
          <span className="text-sm font-medium whitespace-nowrap">
            {selectedCount === 1 ? 'lead seleccionado' : 'leads seleccionados'}
          </span>
          {/* Badge informativo */}
          <Badge className="text-xs px-2 py-1 bg-blue-100 text-blue-800">
            {selectedCount} de {totalLeads}
          </Badge>
        </div>
        
        {/* Separador vertical (solo en desktop) */}
        <div className="hidden sm:block h-6 w-px bg-gray-200"></div>
        
        {/* Acciones */}
        <div className="flex items-center space-x-3">
          {/* Botón de envío masivo */}
          <button
            onClick={onSendBulkMessage}
            disabled={isLoading}
            className="flex items-center px-6 py-2 text-sm bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-20"
            aria-label="Enviar mensaje a los leads seleccionados"
          >
            {isLoading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Enviando...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Enviar Mensaje Masivo
              </>
            )}
          </button>
          
          {/* Separador pequeño */}
          <div className="h-4 w-px bg-gray-200"></div>
          
          {/* Botón limpiar selección */}
          <button
            onClick={onClearSelection}
            disabled={isLoading}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-20"
            title="Limpiar selección"
            aria-label="Limpiar selección de leads"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
