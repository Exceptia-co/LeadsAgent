'use client'

import { useState, useEffect } from 'react'
import { WHATSAPP_API_URL } from '../../lib/api-config'
import { Card } from '../ui/card'
import { Badge } from '../ui/badge'
import { Search, Send, User } from 'lucide-react'
import { Template } from '../templates/TemplateCard'
import SendMessageModal from './SendMessageModal'

export interface Lead {
  id: string
  name: string
  phone: string
  email?: string
  status: string
  whatsappAuthorized?: boolean
}

interface ProactiveMessageSenderProps {
  templates: Template[]
  onSendMessage: (leadId: string, templateId?: string, content?: string, variables?: { [key: string]: string }) => Promise<void>
  selectedTemplate?: Template | null
}

export default function ProactiveMessageSender({ 
  templates, 
  onSendMessage,
  selectedTemplate 
}: ProactiveMessageSenderProps) {
  const [leads, setLeads] = useState<Lead[]>([])
  const [filteredLeads, setFilteredLeads] = useState<Lead[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  
  // Modal state
  const [showSendModal, setShowSendModal] = useState(false)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)

  useEffect(() => {
    fetchLeads()
  }, [])

  useEffect(() => {
    // Filter leads for proactive messages
    const filtered = leads.filter(lead => {
      const matchesSearch = lead.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          lead.phone.includes(searchTerm)
      const isAuthorized = lead.whatsappAuthorized !== false
      return matchesSearch && isAuthorized
    })
    setFilteredLeads(filtered)
  }, [leads, searchTerm])

  const fetchLeads = async () => {
    setLoading(true)
    try {
      const response = await fetch(`${WHATSAPP_API_URL}/leads`)
      const result = await response.json()
      
      if (result.success) {
        setLeads(result.leads || result.data)
      }
    } catch (error) {
      console.error('Error fetching leads:', error)
    } finally {
      setLoading(false)
    }
  }

  const openSendModal = (lead: Lead) => {
    setSelectedLead(lead)
    setShowSendModal(true)
  }

  const closeSendModal = () => {
    setShowSendModal(false)
    setSelectedLead(null)
  }

  const handleSendMessage = async (templateId?: string, content?: string, variables?: { [key: string]: string }) => {
    if (!selectedLead) return
    
    try {
      await onSendMessage(selectedLead.id, templateId, content, variables)
      closeSendModal()
    } catch (error) {
      throw error // Re-throw to handle in modal
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-semibold text-gray-900">Mensajes Proactivos</h2>
        <div className="animate-pulse space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Search */}
      <Card className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <input
            type="text"
            placeholder="Buscar leads por nombre o teléfono..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 pr-3 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </Card>

      {/* Leads Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredLeads.map(lead => (
          <Card key={lead.id} className="p-4 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-medium text-gray-900">{lead.name || 'Sin nombre'}</h3>
                <p className="text-sm text-gray-600">{lead.phone}</p>
                {lead.email && (
                  <p className="text-xs text-gray-500">{lead.email}</p>
                )}
              </div>
              <Badge variant="outline" className="text-xs">
                {lead.status}
              </Badge>
            </div>
            
            <button
              onClick={() => openSendModal(lead)}
              className="w-full flex items-center justify-center px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
            >
              <Send className="h-4 w-4 mr-2" />
              Enviar Mensaje
            </button>
          </Card>
        ))}
      </div>

      {filteredLeads.length === 0 && (
        <Card className="p-12 text-center">
          <User className="mx-auto h-12 w-12 text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No hay leads disponibles</h3>
          <p className="text-gray-500">
            {searchTerm 
              ? 'No se encontraron leads con los criterios de búsqueda.'
              : 'No hay leads autorizados para WhatsApp disponibles.'
            }
          </p>
        </Card>
      )}

      {/* Send Message Modal */}
      {showSendModal && selectedLead && (
        <SendMessageModal
          isOpen={showSendModal}
          onClose={closeSendModal}
          onSend={handleSendMessage}
          lead={selectedLead}
          templates={templates}
          selectedTemplate={selectedTemplate}
        />
      )}
    </div>
  )
}
