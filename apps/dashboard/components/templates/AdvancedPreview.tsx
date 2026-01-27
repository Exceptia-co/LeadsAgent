'use client'

import { useState, useEffect } from 'react'
import { getWhatsAppUrl } from '../../hooks/use-whatsapp-url'
import { Card } from '../ui/card'
import { Badge } from '../ui/badge'
import { 
  Eye,
  Users,
  Smartphone,
  RefreshCw,
  Send,
  Copy,
  User,
  X,
  ArrowRight,
  Calendar,
  MapPin,
  Tag
} from 'lucide-react'

interface Lead {
  id: string
  name: string
  phone: string
  email?: string
  status: string
  source: string
  createdAt: string
}

interface AdvancedPreviewProps {
  templateId?: string
  templateContent: string
  variables: string[]
  onClose?: () => void
  onSendToLead?: (leadId: string, content: string) => void
}

export default function AdvancedPreview({
  templateId,
  templateContent,
  variables,
  onClose,
  onSendToLead
}: AdvancedPreviewProps) {
  const [leads, setLeads] = useState<Lead[]>([])
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [previewContent, setPreviewContent] = useState('')
  const [customVariables, setCustomVariables] = useState<{ [key: string]: string }>({})
  const [loading, setLoading] = useState(true)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    fetchLeads()
  }, [])

  useEffect(() => {
    if (selectedLead && templateContent) {
      generatePreview()
    }
  }, [selectedLead, templateContent, customVariables])

  const fetchLeads = async () => {
    setLoading(true)
    try {
      const response = await fetch(`${getWhatsAppUrl()}/leads`)
      const result = await response.json()
      
      if (result.success) {
        setLeads(result.leads || [])
        // Auto-seleccionar el primer lead si existe
        if (result.leads && result.leads.length > 0) {
          setSelectedLead(result.leads[0])
        }
      } else {
        // Mock data para desarrollo
        const mockLeads = [
          {
            id: 'lead-1',
            name: 'María García',
            phone: '+34 612 345 678',
            email: 'maria@example.com',
            status: 'NUEVO',
            source: 'website',
            createdAt: new Date().toISOString()
          },
          {
            id: 'lead-2',
            name: 'Carlos Rodríguez',
            phone: '+34 698 765 432',
            email: 'carlos@example.com',
            status: 'QUALIFIED',
            source: 'referral',
            createdAt: new Date().toISOString()
          },
          {
            id: 'lead-3',
            name: 'Ana López',
            phone: '+34 655 888 999',
            status: 'CONTACTADO',
            source: 'social_media',
            createdAt: new Date().toISOString()
          }
        ]
        setLeads(mockLeads)
        setSelectedLead(mockLeads[0])
      }
    } catch (error) {
      console.error('Error fetching leads:', error)
      // Usar datos mock en caso de error
      const mockLeads = [
        {
          id: 'lead-1',
          name: 'María García',
          phone: '+34 612 345 678',
          email: 'maria@example.com',
          status: 'NUEVO',
          source: 'website',
          createdAt: new Date().toISOString()
        }
      ]
      setLeads(mockLeads)
      setSelectedLead(mockLeads[0])
    } finally {
      setLoading(false)
    }
  }

  const generatePreview = async () => {
    if (!selectedLead || !templateContent) return

    setPreviewLoading(true)
    try {
      // Si tenemos templateId, usar el endpoint de preview del backend
      if (templateId) {
        const response = await fetch(`${getWhatsAppUrl()}/templates/${templateId}/preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            variables: {
              nombre: selectedLead.name || 'Usuario',
              telefono: selectedLead.phone,
              email: selectedLead.email || '',
              estado: selectedLead.status,
              origen: selectedLead.source,
              ...customVariables
            }
          })
        })

        const result = await response.json()
        if (result.success) {
          setPreviewContent(result.data.previewContent)
        } else {
          throw new Error('Failed to generate preview')
        }
      } else {
        // Preview local para templates no guardados
        let content = templateContent
        
        // Aplicar variables del lead seleccionado
        const leadData = {
          nombre: selectedLead.name || 'Usuario',
          telefono: selectedLead.phone,
          email: selectedLead.email || '',
          estado: selectedLead.status,
          origen: selectedLead.source,
          // Variables del sistema
          empresa: 'EscortsHub',
          sitio_web: 'www.escortshub.com',
          telefono_soporte: '+34 900 123 456',
          email_soporte: 'soporte@escortshub.com',
          // Variables dinámicas
          saludo: new Date().getHours() < 12 ? 'Buenos días' : 
                 new Date().getHours() < 18 ? 'Buenas tardes' : 'Buenas noches',
          fecha_actual: new Date().toLocaleDateString('es-ES'),
          hora_actual: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
          dia_semana: new Date().toLocaleDateString('es-ES', { weekday: 'long' }),
          mes_actual: new Date().toLocaleDateString('es-ES', { month: 'long' }),
          ...customVariables
        }

        // Reemplazar variables
        Object.entries(leadData).forEach(([key, value]) => {
          const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g')
          content = content.replace(regex, value || `{{${key}}}`)
        })

        setPreviewContent(content)
      }
    } catch (error) {
      console.error('Error generating preview:', error)
      setPreviewContent(templateContent)
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleSendMessage = () => {
    if (selectedLead && previewContent && onSendToLead) {
      onSendToLead(selectedLead.id, previewContent)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      console.log('Contenido copiado al portapapeles')
    })
  }

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'nuevo': return 'bg-blue-100 text-blue-800'
      case 'contactado': return 'bg-yellow-100 text-yellow-800'
      case 'qualified': return 'bg-green-100 text-green-800'
      case 'ganado': return 'bg-emerald-100 text-emerald-800'
      case 'perdido': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const filteredLeads = leads.filter(lead =>
    lead.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    lead.phone.includes(searchTerm) ||
    lead.email?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[90] p-4">
      <Card className="w-full max-w-6xl max-h-[90vh] overflow-y-auto bg-white shadow-2xl border-2 border-gray-200">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Eye className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  Vista Previa Avanzada
                </h2>
                <p className="text-sm text-gray-500">
                  Prueba tu template con datos reales de leads
                </p>
              </div>
            </div>
            
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Lead Selection */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900 flex items-center">
                  <Users className="h-4 w-4 mr-2" />
                  Seleccionar Lead
                </h3>
                <Badge variant="outline" className="text-xs">
                  {filteredLeads.length} leads
                </Badge>
              </div>

              {/* Search */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Buscar leads..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-3 py-2 pl-8 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <Users className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
              </div>

              {/* Leads List */}
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {loading ? (
                  <div className="text-center py-8">
                    <RefreshCw className="h-8 w-8 mx-auto text-gray-300 animate-spin mb-2" />
                    <p className="text-sm text-gray-500">Cargando leads...</p>
                  </div>
                ) : filteredLeads.length === 0 ? (
                  <div className="text-center py-8">
                    <User className="h-8 w-8 mx-auto text-gray-300 mb-2" />
                    <p className="text-sm text-gray-500">No se encontraron leads</p>
                  </div>
                ) : (
                  filteredLeads.map(lead => (
                    <div
                      key={lead.id}
                      onClick={() => setSelectedLead(lead)}
                      className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedLead?.id === lead.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium text-sm text-gray-900">
                          {lead.name || 'Sin nombre'}
                        </h4>
                        <Badge className={`text-xs ${getStatusColor(lead.status)}`}>
                          {lead.status}
                        </Badge>
                      </div>
                      <div className="space-y-1 text-xs text-gray-500">
                        <div className="flex items-center">
                          <Smartphone className="h-3 w-3 mr-1" />
                          {lead.phone}
                        </div>
                        {lead.email && (
                          <div className="flex items-center">
                            <span className="w-3 h-3 mr-1">@</span>
                            {lead.email}
                          </div>
                        )}
                        <div className="flex items-center">
                          <MapPin className="h-3 w-3 mr-1" />
                          {lead.source}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Template Preview */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900">
                  Vista Previa del Mensaje
                </h3>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => generatePreview()}
                    disabled={previewLoading}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Actualizar preview"
                  >
                    <RefreshCw className={`h-4 w-4 ${previewLoading ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    onClick={() => copyToClipboard(previewContent)}
                    className="p-2 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                    title="Copiar mensaje"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Selected Lead Info */}
              {selectedLead && (
                <Card className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium text-gray-900 flex items-center">
                        <User className="h-4 w-4 mr-2 text-blue-600" />
                        {selectedLead.name || 'Sin nombre'}
                      </h4>
                      <div className="flex items-center space-x-4 text-sm text-gray-600 mt-1">
                        <span>{selectedLead.phone}</span>
                        {selectedLead.email && <span>{selectedLead.email}</span>}
                        <Badge className={`text-xs ${getStatusColor(selectedLead.status)}`}>
                          {selectedLead.status}
                        </Badge>
                      </div>
                    </div>
                    <div className="text-right text-xs text-gray-500">
                      <div>Origen: {selectedLead.source}</div>
                      <div className="flex items-center mt-1">
                        <Calendar className="h-3 w-3 mr-1" />
                        {new Date(selectedLead.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </Card>
              )}

              {/* Custom Variables */}
              {variables.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-3">
                    Variables Personalizadas
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    {variables.filter(v => !['nombre', 'telefono', 'email', 'estado', 'origen'].includes(v)).map(variable => (
                      <div key={variable}>
                        <label className="block text-xs text-gray-600 mb-1">
                          {`{{${variable}}}`}
                        </label>
                        <input
                          type="text"
                          value={customVariables[variable] || ''}
                          onChange={(e) => setCustomVariables(prev => ({
                            ...prev,
                            [variable]: e.target.value
                          }))}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="Valor personalizado..."
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Message Preview */}
              <div className="relative">
                <h4 className="text-sm font-medium text-gray-700 mb-2">
                  Mensaje Final
                </h4>
                <div className="bg-white border rounded-lg shadow-sm">
                  {/* WhatsApp-like header */}
                  <div className="px-4 py-2 bg-green-500 text-white rounded-t-lg flex items-center space-x-2">
                    <Smartphone className="h-4 w-4" />
                    <span className="font-medium text-sm">
                      WhatsApp - {selectedLead?.name || 'Lead'}
                    </span>
                  </div>
                  
                  {/* Message content */}
                  <div className="p-4 min-h-[200px]">
                    {previewLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <RefreshCw className="h-8 w-8 text-gray-400 animate-spin" />
                      </div>
                    ) : (
                      <div className="bg-green-100 p-3 rounded-lg max-w-sm ml-auto">
                        <pre className="whitespace-pre-wrap text-sm text-gray-800">
                          {previewContent || templateContent || 'Contenido del mensaje aparecerá aquí...'}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-between items-center pt-4 border-t">
                <div className="text-sm text-gray-500">
                  {variables.length > 0 && (
                    <span>{variables.length} variables • </span>
                  )}
                  {previewContent.length} caracteres
                </div>
                
                <div className="flex space-x-3">
                  <button
                    onClick={() => copyToClipboard(previewContent)}
                    className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center"
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copiar
                  </button>
                  
                  {onSendToLead && selectedLead && (
                    <button
                      onClick={handleSendMessage}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center"
                    >
                      <Send className="h-4 w-4 mr-2" />
                      Enviar a {selectedLead.name}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
