import React, { useState, useEffect } from 'react'
import { Badge } from './ui/badge'
import { useLeads, Lead } from '../hooks/use-leads'
import { STATUS_VARIANTS, STATUS_LABELS } from '../types'
import { Search, User, Phone, Loader2 } from 'lucide-react'

interface LeadSelectorProps {
  selectedLead?: Lead | null
  onSelectLead: (lead: Lead) => void
  className?: string
}

export function LeadSelector({ selectedLead, onSelectLead, className = '' }: LeadSelectorProps) {
  const { leads, isLoading, error, loadLeads } = useLeads()
  const [searchTerm, setSearchTerm] = useState('')
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    loadLeads()
  }, [loadLeads])

  const filteredLeads = leads.filter(lead =>
    lead.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    lead.phone.includes(searchTerm) ||
    lead.email?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleSelectLead = (lead: Lead) => {
    onSelectLead(lead)
    setIsOpen(false)
    setSearchTerm('')
  }

  return (
    <div className={`relative ${className}`}>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Seleccionar Lead
      </label>
      
      {/* Selected Lead Display */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md cursor-pointer bg-white hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-between"
      >
        {selectedLead ? (
          <div className="flex items-center space-x-2">
            <User className="h-4 w-4 text-gray-500" />
            <span className="font-medium">{selectedLead.name || 'Sin nombre'}</span>
            <span className="text-gray-500">{selectedLead.phone}</span>
            <Badge variant={STATUS_VARIANTS[selectedLead.status as keyof typeof STATUS_VARIANTS]}>
              {STATUS_LABELS[selectedLead.status as keyof typeof STATUS_LABELS]}
            </Badge>
          </div>
        ) : (
          <div className="flex items-center space-x-2 text-gray-500">
            <User className="h-4 w-4" />
            <span>Seleccionar un lead...</span>
          </div>
        )}
        <div className="text-gray-400">
          {isOpen ? '▲' : '▼'}
        </div>
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-96 overflow-y-auto">
          {/* Search Input */}
          <div className="p-3 border-b border-gray-200">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por nombre, teléfono o email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
              <span className="ml-2 text-gray-600">Cargando leads...</span>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="p-4 text-center text-red-600">
              <p>Error cargando leads:</p>
              <p className="text-sm">{error}</p>
            </div>
          )}

          {/* Leads List */}
          {!isLoading && !error && (
            <>
              {filteredLeads.length === 0 ? (
                <div className="p-4 text-center text-gray-500">
                  {leads.length === 0 ? 'No hay leads disponibles' : 'No se encontraron leads'}
                </div>
              ) : (
                <div className="max-h-64 overflow-y-auto">
                  {filteredLeads.map((lead) => (
                    <div
                      key={lead.id}
                      onClick={() => handleSelectLead(lead)}
                      className="flex items-center justify-between p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                    >
                      <div className="flex items-center space-x-3">
                        <User className="h-4 w-4 text-gray-500" />
                        <div>
                          <p className="font-medium text-gray-900">
                            {lead.name || 'Sin nombre'}
                          </p>
                          <div className="flex items-center space-x-2 text-sm text-gray-500">
                            <Phone className="h-3 w-3" />
                            <span>{lead.phone}</span>
                            {lead.email && (
                              <>
                                <span>•</span>
                                <span>{lead.email}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge variant={STATUS_VARIANTS[lead.status as keyof typeof STATUS_VARIANTS]}>
                          {STATUS_LABELS[lead.status as keyof typeof STATUS_LABELS]}
                        </Badge>
                        <span className="text-xs text-gray-400">
                          {new Date(lead.createdAt).toLocaleDateString('es-ES')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Manual Input Option */}
          <div className="border-t border-gray-200 p-3">
            <button
              onClick={() => {
                setIsOpen(false)
                onSelectLead({
                  id: 'manual',
                  name: 'Número manual',
                  phone: '',
                  status: 'NUEVO',
                  createdAt: new Date().toISOString()
                })
              }}
              className="w-full text-left text-sm text-blue-600 hover:text-blue-800 flex items-center space-x-2"
            >
              <Phone className="h-4 w-4" />
              <span>Escribir número manualmente</span>
            </button>
          </div>
        </div>
      )}

      {/* Click outside to close */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  )
}
