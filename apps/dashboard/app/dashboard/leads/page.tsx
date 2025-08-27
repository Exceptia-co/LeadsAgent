'use client'

import { useState, useEffect, useRef } from 'react'
import { Card } from '../../../components/ui/card'
import { Badge } from '../../../components/ui/badge'
import { useLeads } from '../../../lib/api'
import { STATUS_LABELS, STATUS_VARIANTS, type Lead } from '../../../types'
import { AddLeadModal } from '../../../components/AddLeadModal'
import { EditLeadModal } from '../../../components/EditLeadModal'
import { DeleteConfirmDialog } from '../../../components/DeleteConfirmDialog'
import { Users, Search, Plus, Filter, Edit2, Trash2, Eye, X } from 'lucide-react'
import { useAuth } from '@clerk/nextjs'
import { useToast } from '../../../hooks/use-toast'
import { useDebounce } from '../../../hooks/use-debounce'

export default function LeadsPage() {
  const [currentPage, setCurrentPage] = useState(1)
  const [searchTerm, setSearchTerm] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  
  // Ref to maintain focus on search input
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [shouldMaintainFocus, setShouldMaintainFocus] = useState(false)
  
  // Debounce the search term to avoid too many API calls
  const debouncedSearchTerm = useDebounce(searchTerm, 500)
  
  // Use debounced search term for API call
  const { leads, pagination, isLoading, isError, refetch, isRefreshing } = useLeads(
    currentPage, 
    20, 
    debouncedSearchTerm
  )
  
  const { getToken } = useAuth()
  const { success: toastSuccess, error: toastError } = useToast()
  
  // Reset to first page when search term changes
  useEffect(() => {
    if (debouncedSearchTerm !== '') {
      setCurrentPage(1)
    }
  }, [debouncedSearchTerm])
  
  // Track when we're actively searching (for UI feedback)
  useEffect(() => {
    const wasSearching = isSearching
    setIsSearching(searchTerm !== debouncedSearchTerm)
    
    // If we just finished searching and should maintain focus, refocus the input
    if (wasSearching && !isSearching && shouldMaintainFocus && searchInputRef.current) {
      searchInputRef.current.focus()
      setShouldMaintainFocus(false)
    }
  }, [searchTerm, debouncedSearchTerm, isSearching, shouldMaintainFocus])
  
  // Maintain focus after data updates if user was typing
  useEffect(() => {
    if (shouldMaintainFocus && searchInputRef.current && !isLoading) {
      // Use setTimeout to ensure focus happens after render
      const timeoutId = setTimeout(() => {
        if (searchInputRef.current && shouldMaintainFocus) {
          searchInputRef.current.focus()
          // Restore cursor position to the end
          const len = searchInputRef.current.value.length
          searchInputRef.current.setSelectionRange(len, len)
        }
      }, 0)
      return () => clearTimeout(timeoutId)
    }
  }, [leads, isLoading, shouldMaintainFocus])

  const handleWhatsAppToggle = async (leadId: string, authorized: boolean) => {
    try {
      const response = await fetch(`/api/public/leads/${leadId}/whatsapp`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ whatsappAuthorized: authorized })
      })
      
      if (response.ok) {
        refetch() // Refrescar la lista de leads
      } else {
        console.error('Error updating WhatsApp authorization')
      }
    } catch (error) {
      console.error('Error updating WhatsApp authorization:', error)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Gestión de Leads</h1>
        <div className="animate-pulse space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-200 rounded-lg"></div>
          ))}
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Gestión de Leads</h1>
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-800">Error al cargar los leads. Verifica que el servidor backend esté funcionando.</p>
          <button 
            onClick={() => refetch()} 
            className="mt-2 text-red-600 hover:text-red-800 underline"
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  // No need for client-side filtering anymore, the backend handles it
  const displayLeads = leads

  const handleLeadCreated = () => {
    setIsModalOpen(false)
    toastSuccess('Lead creado exitosamente')
    refetch() // Refresh the leads list
  }

  const handleEditClick = (lead: Lead) => {
    setSelectedLead(lead)
    setIsEditModalOpen(true)
  }

  const handleEditSuccess = () => {
    setIsEditModalOpen(false)
    toastSuccess('Lead actualizado exitosamente')
    refetch() // Refresh the leads list
    setSelectedLead(null)
  }

  const handleDeleteClick = (lead: Lead) => {
    setSelectedLead(lead)
    setIsDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!selectedLead) return
    
    try {
      const token = await getToken()
      const response = await fetch(`/api/leads/${selectedLead.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
      
      if (response.ok) {
        toastSuccess('Lead eliminado exitosamente')
        refetch() // Refresh the leads list
      } else {
        const error = await response.json()
        toastError(error.message || 'Error al eliminar el lead')
      }
    } catch (error) {
      console.error('Error deleting lead:', error)
      toastError('Error al eliminar el lead')
    } finally {
      setIsDeleteDialogOpen(false)
      setSelectedLead(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Gestión de Leads</h1>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Lead
        </button>
      </div>

      {/* Filters and Search */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Buscar por nombre, teléfono o email..."
              className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value)
                setShouldMaintainFocus(true)
              }}
              onBlur={() => setShouldMaintainFocus(false)}
            />
            {/* Clear search button */}
            {searchTerm && (
              <button
                onClick={() => {
                  setSearchTerm('')
                  setShouldMaintainFocus(true)
                  // Focus back on input after clearing
                  setTimeout(() => {
                    searchInputRef.current?.focus()
                  }, 0)
                }}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                tabIndex={-1} // Prevent this button from taking focus
              >
                <X className="h-4 w-4" />
              </button>
            )}
            {/* Search indicator */}
            {isSearching && (
              <div className="absolute right-10 top-1/2 transform -translate-y-1/2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
              </div>
            )}
          </div>
          <button className="flex items-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            <Filter className="h-4 w-4 mr-2" />
            Filtros
          </button>
        </div>
        {/* Active search indicator */}
        {debouncedSearchTerm && (
          <div className="mt-3 text-sm text-gray-600">
            Mostrando resultados para: <span className="font-medium">"{debouncedSearchTerm}"</span>
          </div>
        )}
      </Card>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">{pagination?.total || 0}</p>
            <p className="text-sm text-gray-500">Total Leads</p>
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-600">
              {leads.filter((l: Lead) => l.status === 'NUEVO').length}
            </p>
            <p className="text-sm text-gray-500">Nuevos</p>
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-yellow-600">
              {leads.filter((l: Lead) => l.status === 'QUALIFIED').length}
            </p>
            <p className="text-sm text-gray-500">Calificados</p>
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-green-600">
              {leads.filter((l: Lead) => l.status === 'GANADO').length}
            </p>
            <p className="text-sm text-gray-500">Ganados</p>
          </div>
        </Card>
      </div>

      {/* Leads Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Lead
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Teléfono
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Estado
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Score
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Fecha
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  WhatsApp IA
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {displayLeads.length > 0 ? (
                displayLeads.map((lead: Lead) => (
                  <tr key={lead.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                            <Users className="h-5 w-5 text-gray-600" />
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">{lead.name || 'Sin nombre'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {lead.phone}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={STATUS_VARIANTS[lead.status]}>
                        {STATUS_LABELS[lead.status]}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {lead.score ? Number(lead.score).toFixed(1) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(lead.createdAt).toLocaleDateString('es-ES')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <label className="flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={lead.whatsappAuthorized || false}
                            onChange={(e) => handleWhatsAppToggle(lead.id, e.target.checked)}
                            className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                          />
                          <span className="ml-2 text-sm text-gray-900">
                            {lead.whatsappAuthorized ? (
                              <span className="flex items-center text-green-600">
                                <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                                Autorizado
                              </span>
                            ) : (
                              <span className="text-gray-500">No autorizado</span>
                            )}
                          </span>
                        </label>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center space-x-3">
                        <button 
                          className="text-blue-600 hover:text-blue-900 transition-colors"
                          title="Ver detalles"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button 
                          onClick={() => handleEditClick(lead)}
                          className="text-yellow-600 hover:text-yellow-900 transition-colors"
                          title="Editar lead"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button 
                          onClick={() => handleDeleteClick(lead)}
                          className="text-red-600 hover:text-red-900 transition-colors"
                          title="Eliminar lead"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <Users className="mx-auto h-12 w-12 text-gray-300 mb-4" />
                    <p className="text-gray-500">
                      {debouncedSearchTerm 
                        ? `No se encontraron leads que coincidan con "${debouncedSearchTerm}"` 
                        : 'No hay leads disponibles'
                      }
                    </p>
                    {debouncedSearchTerm && (
                      <button
                        onClick={() => {
                          setSearchTerm('')
                          setShouldMaintainFocus(true)
                          // Focus back on input after clearing
                          setTimeout(() => {
                            searchInputRef.current?.focus()
                          }, 0)
                        }}
                        className="mt-2 text-blue-600 hover:text-blue-800 underline"
                      >
                        Limpiar búsqueda
                      </button>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination - Hide if searching and no results, or if only one page */}
        {pagination && pagination.totalPages > 1 && (
          <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-700">
              Mostrando {((pagination.page - 1) * pagination.limit) + 1} a{' '}
              {Math.min(pagination.page * pagination.limit, pagination.total)} de{' '}
              {pagination.total} resultados
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={!pagination.hasPrev}
                className="px-3 py-1 border border-gray-300 rounded-md text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Anterior
              </button>
              <span className="px-3 py-1 text-sm">
                Página {pagination.page} de {pagination.totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(Math.min(pagination.totalPages, currentPage + 1))}
                disabled={!pagination.hasNext}
                className="px-3 py-1 border border-gray-300 rounded-md text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </Card>
      
      {/* Add Lead Modal */}
      <AddLeadModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleLeadCreated}
      />
      
      {/* Edit Lead Modal */}
      <EditLeadModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSuccess={handleEditSuccess}
        lead={selectedLead}
      />
      
      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => {
          setIsDeleteDialogOpen(false)
          setSelectedLead(null)
        }}
        onConfirm={handleDeleteConfirm}
        leadName={selectedLead?.name}
        leadPhone={selectedLead?.phone}
      />
    </div>
  )
}
