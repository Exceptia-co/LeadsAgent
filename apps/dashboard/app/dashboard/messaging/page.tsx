'use client'

import { useState, useEffect } from 'react'
import { WHATSAPP_API_URL } from '../../../lib/api-config'
import { Card } from '../../../components/ui/card'
import { Badge } from '../../../components/ui/badge'
import { 
  Send, 
  User, 
  MessageSquare, 
  Search, 
  Filter,
  Eye,
  X,
  CheckCircle,
  Clock,
  AlertCircle,
  XCircle,
  Plus,
  Edit,
  FileText,
  Trash2,
  Copy
} from 'lucide-react'

interface Lead {
  id: string
  name: string
  phone: string
  email?: string
  status: string
  whatsappAuthorized?: boolean
}

interface Template {
  id: string
  name: string
  category: string
  subject?: string
  content: string
  variables: string[]
  usageCount?: number
  isActive?: boolean
  createdAt?: string
}

interface ProactiveMessage {
  id: string
  leadId: string
  templateId?: string
  templateName?: string
  phoneNumber: string
  content: string
  status: 'pending' | 'sent' | 'delivered' | 'failed'
  sentAt?: string
  deliveredAt?: string
  errorMessage?: string
  createdAt: string
}

export default function MessagingPage() {
  // Data states
  const [leads, setLeads] = useState<Lead[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [proactiveMessages, setProactiveMessages] = useState<ProactiveMessage[]>([])
  const [filteredLeads, setFilteredLeads] = useState<Lead[]>([])
  const [filteredTemplates, setFilteredTemplates] = useState<Template[]>([])
  
  // Main UI states
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'templates' | 'proactive'>('templates')
  const [proactiveSubTab, setProactiveSubTab] = useState<'send' | 'history'>('send')
  
  // Search and filters
  const [searchTerm, setSearchTerm] = useState('')
  const [templateSearch, setTemplateSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  
  // Template modal states
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null)
  const [templateForm, setTemplateForm] = useState({
    name: '',
    category: '',
    subject: '',
    content: '',
    variables: [] as string[]
  })
  const [templatePreview, setTemplatePreview] = useState('')
  const [templateVariables, setTemplateVariables] = useState<{ [key: string]: string }>({})
  
  // Proactive message modal states
  const [showSendModal, setShowSendModal] = useState(false)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [customMessage, setCustomMessage] = useState('')
  const [previewContent, setPreviewContent] = useState('')
  const [variables, setVariables] = useState<{ [key: string]: string }>({})
  const [sending, setSending] = useState(false)

  useEffect(() => {
    fetchData()
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

  useEffect(() => {
    // Filter templates
    const filtered = templates.filter(template => {
      const matchesSearch = template.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
                          template.content.toLowerCase().includes(templateSearch.toLowerCase())
      const matchesCategory = categoryFilter === 'all' || template.category === categoryFilter
      return matchesSearch && matchesCategory && template.isActive !== false
    })
    setFilteredTemplates(filtered)
  }, [templates, templateSearch, categoryFilter])

  useEffect(() => {
    if (selectedTemplate && selectedLead) {
      generateProactivePreview()
    }
  }, [selectedTemplate, selectedLead, variables])

  useEffect(() => {
    if (editingTemplate) {
      generateTemplatePreview()
    }
  }, [templateForm.content, templateVariables])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [leadsRes, templatesRes, messagesRes] = await Promise.all([
        fetch(`${WHATSAPP_API_URL}/leads`),
        fetch(`${WHATSAPP_API_URL}/templates`),
        fetch(`${WHATSAPP_API_URL}/proactive-messages`)
      ])

      const [leadsResult, templatesResult, messagesResult] = await Promise.all([
        leadsRes.json(),
        templatesRes.json(),
        messagesRes.json()
      ])

      if (leadsResult.success) {
        setLeads(leadsResult.leads || leadsResult.data)
      }
      
      if (templatesResult.success) {
        setTemplates(templatesResult.data)
      }
      
      if (messagesResult.success) {
        setProactiveMessages(messagesResult.data)
      }
    } catch (error) {
      console.error('Error fetching data:', error)
      // Fallback to mock data
      setTemplates([
        {
          id: 'mock_1',
          name: 'Mensaje de Bienvenida',
          category: 'welcome',
          content: '¡Hola {{nombre}}! 👋\n\nBienvenido/a a EscortsHub.',
          variables: ['nombre']
        }
      ])
    } finally {
      setLoading(false)
    }
  }

  const generateTemplatePreview = () => {
    if (!templateForm.content) return
    
    let content = templateForm.content
    Object.entries(templateVariables).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g')
      content = content.replace(regex, value || `{{${key}}}`)
    })
    setTemplatePreview(content)
  }

  const generateProactivePreview = () => {
    if (!selectedTemplate || !selectedLead) return
    
    let content = selectedTemplate.content
    const leadVariables = {
      nombre: selectedLead.name || 'Usuario',
      telefono: selectedLead.phone,
      email: selectedLead.email || '',
      ...variables
    }
    
    Object.entries(leadVariables).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g')
      content = content.replace(regex, value)
    })
    
    setPreviewContent(content)
  }

  const extractVariables = (content: string): string[] => {
    const matches = content.match(/\{\{([^}]+)\}\}/g)
    if (!matches) return []
    
    return Array.from(new Set(matches.map(match => match.slice(2, -2).trim())))
  }

  const handleSaveTemplate = async () => {
    try {
      const variables = extractVariables(templateForm.content)
      const templateData = {
        ...templateForm,
        variables
      }

      const url = editingTemplate 
        ? `${WHATSAPP_API_URL}/templates/${editingTemplate.id}`
        : `${WHATSAPP_API_URL}/templates`
      
      const method = editingTemplate ? 'PUT' : 'POST'
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(templateData)
      })

      const result = await response.json()
      
      if (result.success) {
        setShowTemplateModal(false)
        resetTemplateForm()
        fetchData()
        alert(editingTemplate ? 'Template actualizado exitosamente!' : 'Template creado exitosamente!')
      } else {
        alert('Error: ' + result.error)
      }
    } catch (error) {
      console.error('Error saving template:', error)
      alert('Error guardando el template')
    }
  }

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este template?')) return
    
    try {
      const response = await fetch(`${WHATSAPP_API_URL}/templates/${id}`, {
        method: 'DELETE'
      })
      
      const result = await response.json()
      
      if (result.success) {
        fetchData()
        alert('Template eliminado exitosamente!')
      } else {
        alert('Error: ' + result.error)
      }
    } catch (error) {
      console.error('Error deleting template:', error)
      alert('Error eliminando el template')
    }
  }

  const handleSendMessage = async () => {
    if (!selectedLead) return
    
    setSending(true)
    try {
      const content = selectedTemplate ? previewContent : customMessage
      
      const sessionsResponse = await fetch(`${WHATSAPP_API_URL}/sessions`)
      const sessionsResult = await sessionsResponse.json()
      
      let sessionId = 'demo-session'
      
      if (sessionsResult.success && sessionsResult.sessions.length > 0) {
        sessionId = sessionsResult.sessions[0].id
      }
      
      const response = await fetch(`${WHATSAPP_API_URL}/proactive-messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: selectedLead.id,
          templateId: selectedTemplate?.id,
          sessionId,
          content,
          variables
        })
      })
      
      const result = await response.json()
      
      if (result.success) {
        setShowSendModal(false)
        resetSendForm()
        fetchData()
        setProactiveSubTab('history')
        alert('¡Mensaje enviado exitosamente!')
      } else {
        alert('Error enviando mensaje: ' + result.error)
      }
    } catch (error) {
      console.error('Error sending message:', error)
      alert('Error enviando mensaje')
    } finally {
      setSending(false)
    }
  }

  const resetTemplateForm = () => {
    setTemplateForm({
      name: '',
      category: '',
      subject: '',
      content: '',
      variables: []
    })
    setTemplateVariables({})
    setTemplatePreview('')
    setEditingTemplate(null)
  }

  const resetSendForm = () => {
    setSelectedLead(null)
    setSelectedTemplate(null)
    setCustomMessage('')
    setPreviewContent('')
    setVariables({})
  }

  const openEditTemplate = (template: Template) => {
    setEditingTemplate(template)
    setTemplateForm({
      name: template.name,
      category: template.category,
      subject: template.subject || '',
      content: template.content,
      variables: template.variables || []
    })
    setShowTemplateModal(true)
  }

  const openSendModal = (lead: Lead) => {
    setSelectedLead(lead)
    setShowSendModal(true)
  }

  const useTemplateForMessage = (template: Template) => {
    setActiveTab('proactive')
    setProactiveSubTab('send')
    setSelectedTemplate(template)
  }

  const categories = Array.from(new Set(templates.map(t => t.category))).filter(Boolean)
  const filteredMessages = proactiveMessages.filter(message => {
    if (statusFilter === 'all') return true
    return message.status === statusFilter
  })

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Sistema de Mensajería</h1>
        <div className="animate-pulse">
          <div className="h-64 bg-gray-200 rounded-lg"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sistema de Mensajería</h1>
          <p className="text-gray-500">Gestiona templates y envía mensajes proactivos a tus leads</p>
        </div>
        <div className="flex space-x-3">
          {activeTab === 'templates' && (
            <button
              onClick={() => setShowTemplateModal(true)}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Template
            </button>
          )}
        </div>
      </div>

      {/* Main Navigation Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('templates')}
            className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'templates'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <FileText className="h-4 w-4 mr-2 inline" />
            Templates ({templates.length})
          </button>
          
          <button
            onClick={() => setActiveTab('proactive')}
            className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'proactive'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Send className="h-4 w-4 mr-2 inline" />
            Mensajes Proactivos
          </button>
        </nav>
      </div>

      {/* Templates Tab */}
      {activeTab === 'templates' && (
        <div className="space-y-6">
          {/* Templates Search and Filter */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                type="text"
                placeholder="Buscar templates..."
                value={templateSearch}
                onChange={(e) => setTemplateSearch(e.target.value)}
                className="pl-10 pr-3 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">Todas las categorías</option>
              {categories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>

          {/* Templates Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTemplates.map(template => (
              <Card key={template.id} className="p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-900 mb-1">{template.name}</h3>
                    <div className="flex items-center space-x-2 mb-2">
                      <Badge variant="outline" className="text-xs">{template.category}</Badge>
                      {template.usageCount !== undefined && (
                        <span className="text-xs text-gray-500">{template.usageCount} usos</span>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="bg-gray-50 p-3 rounded-lg mb-3">
                  <p className="text-sm text-gray-700 line-clamp-3">
                    {template.content.length > 100 
                      ? template.content.substring(0, 100) + '...' 
                      : template.content}
                  </p>
                </div>

                {template.variables && template.variables.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs text-gray-500 mb-1">Variables:</p>
                    <div className="flex flex-wrap gap-1">
                      {template.variables.map(variable => (
                        <span key={variable} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">
                          {`{{${variable}}}`}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="flex items-center justify-between pt-3 border-t">
                  <div className="flex space-x-2">
                    <button
                      onClick={() => openEditTemplate(template)}
                      className="p-2 text-gray-400 hover:text-gray-600"
                      title="Editar"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteTemplate(template.id)}
                      className="p-2 text-gray-400 hover:text-red-600"
                      title="Eliminar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  
                  <button
                    onClick={() => useTemplateForMessage(template)}
                    className="flex items-center px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                  >
                    <Send className="h-4 w-4 mr-1" />
                    Usar
                  </button>
                </div>
              </Card>
            ))}
          </div>

          {filteredTemplates.length === 0 && (
            <Card className="p-12 text-center">
              <FileText className="mx-auto h-12 w-12 text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No hay templates</h3>
              <p className="text-gray-500 mb-4">
                {templateSearch || categoryFilter !== 'all'
                  ? 'No se encontraron templates con los filtros aplicados.'
                  : 'Crea tu primer template para comenzar.'
                }
              </p>
              <button
                onClick={() => setShowTemplateModal(true)}
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                Crear Template
              </button>
            </Card>
          )}
        </div>
      )}

      {/* Proactive Messages Tab */}
      {activeTab === 'proactive' && (
        <div className="space-y-6">
          {/* Proactive Sub-navigation */}
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setProactiveSubTab('send')}
                className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                  proactiveSubTab === 'send'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Send className="h-4 w-4 mr-2 inline" />
                Enviar Mensaje
              </button>
              
              <button
                onClick={() => setProactiveSubTab('history')}
                className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                  proactiveSubTab === 'history'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <MessageSquare className="h-4 w-4 mr-2 inline" />
                Historial ({proactiveMessages.length})
              </button>
            </nav>
          </div>

          {/* Send Messages Sub-tab */}
          {proactiveSubTab === 'send' && (
            <div className="space-y-6">
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
            </div>
          )}

          {/* History Sub-tab */}
          {proactiveSubTab === 'history' && (
            <div className="space-y-6">
              <Card className="p-4">
                <div className="flex items-center space-x-4">
                  <Filter className="h-4 w-4 text-gray-400" />
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="all">Todos los estados</option>
                    <option value="pending">Pendientes</option>
                    <option value="sent">Enviados</option>
                    <option value="delivered">Entregados</option>
                    <option value="failed">Fallidos</option>
                  </select>
                </div>
              </Card>

              <div className="space-y-4">
                {filteredMessages.map(message => {
                  const lead = leads.find(l => l.id === message.leadId)
                  return (
                    <Card key={message.id} className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-start space-x-4">
                          <div className="flex items-center justify-center w-10 h-10 bg-blue-100 rounded-full">
                            <User className="h-5 w-5 text-blue-600" />
                          </div>
                          
                          <div>
                            <h3 className="font-medium text-gray-900">{lead?.name || 'Lead desconocido'}</h3>
                            <p className="text-sm text-gray-600">{message.phoneNumber}</p>
                            {message.templateName && (
                              <p className="text-xs text-blue-600">Template: {message.templateName}</p>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          {message.status === 'pending' && <Clock className="h-4 w-4 text-yellow-500" />}
                          {message.status === 'sent' && <CheckCircle className="h-4 w-4 text-blue-500" />}
                          {message.status === 'delivered' && <CheckCircle className="h-4 w-4 text-green-500" />}
                          {message.status === 'failed' && <XCircle className="h-4 w-4 text-red-500" />}
                          <Badge variant={
                            message.status === 'delivered' ? 'default' :
                            message.status === 'sent' ? 'secondary' :
                            message.status === 'pending' ? 'outline' : 'destructive'
                          } className="text-xs">
                            {message.status === 'pending' ? 'Pendiente' :
                             message.status === 'sent' ? 'Enviado' :
                             message.status === 'delivered' ? 'Entregado' : 'Falló'}
                          </Badge>
                        </div>
                      </div>
                      
                      <div className="bg-gray-50 p-4 rounded-lg mb-4">
                        <pre className="whitespace-pre-wrap text-sm text-gray-700">
                          {message.content}
                        </pre>
                      </div>
                      
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>
                          Creado: {new Date(message.createdAt).toLocaleString('es-ES')}
                        </span>
                        
                        {message.sentAt && (
                          <span>
                            Enviado: {new Date(message.sentAt).toLocaleString('es-ES')}
                          </span>
                        )}
                      </div>
                      
                      {message.errorMessage && (
                        <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                          Error: {message.errorMessage}
                        </div>
                      )}
                    </Card>
                  )
                })}
              </div>

              {filteredMessages.length === 0 && (
                <Card className="p-12 text-center">
                  <MessageSquare className="mx-auto h-12 w-12 text-gray-300 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No hay mensajes</h3>
                  <p className="text-gray-500">
                    {statusFilter !== 'all' 
                      ? 'No hay mensajes con el estado seleccionado.'
                      : 'No se han enviado mensajes proactivos aún.'
                    }
                  </p>
                </Card>
              )}
            </div>
          )}
        </div>
      )}

      {/* Template Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold">
                  {editingTemplate ? 'Editar Template' : 'Nuevo Template'}
                </h2>
                <button
                  onClick={() => setShowTemplateModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Form */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Nombre del Template
                    </label>
                    <input
                      type="text"
                      value={templateForm.name}
                      onChange={(e) => setTemplateForm(prev => ({...prev, name: e.target.value}))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Ej: Mensaje de bienvenida"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Categoría
                    </label>
                    <select
                      value={templateForm.category}
                      onChange={(e) => setTemplateForm(prev => ({...prev, category: e.target.value}))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Seleccionar categoría</option>
                      <option value="welcome">Bienvenida</option>
                      <option value="pricing">Precios</option>
                      <option value="products">Productos</option>
                      <option value="follow_up">Seguimiento</option>
                      <option value="support">Soporte</option>
                      <option value="other">Otro</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Contenido
                    </label>
                    <textarea
                      value={templateForm.content}
                      onChange={(e) => setTemplateForm(prev => ({...prev, content: e.target.value}))}
                      rows={8}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                      placeholder="Escribe tu mensaje aquí. Usa {{variable}} para variables dinámicas."
                    />
                  </div>

                  {/* Variables detected */}
                  {extractVariables(templateForm.content).length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-2">Variables detectadas:</h3>
                      <div className="flex flex-wrap gap-2">
                        {extractVariables(templateForm.content).map(variable => (
                          <span key={variable} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">
                            {`{{${variable}}}`}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Preview */}
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-gray-700">Vista Previa</h3>
                  
                  {/* Variable inputs for preview */}
                  {extractVariables(templateForm.content).length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium text-gray-600 mb-2">Valores para vista previa:</h4>
                      <div className="space-y-2">
                        {extractVariables(templateForm.content).map(variable => (
                          <div key={variable}>
                            <input
                              type="text"
                              placeholder={`Valor para {{${variable}}}`}
                              value={templateVariables[variable] || ''}
                              onChange={(e) => setTemplateVariables(prev => ({
                                ...prev,
                                [variable]: e.target.value
                              }))}
                              className="w-full px-3 py-1 border border-gray-300 rounded text-sm"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="bg-gray-50 p-4 rounded-lg border min-h-[200px]">
                    <pre className="whitespace-pre-wrap text-sm text-gray-700">
                      {templatePreview || templateForm.content || 'La vista previa aparecerá aquí...'}
                    </pre>
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6 pt-6 border-t">
                <button
                  onClick={() => setShowTemplateModal(false)}
                  className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancelar
                </button>
                
                <button
                  onClick={handleSaveTemplate}
                  disabled={!templateForm.name || !templateForm.category || !templateForm.content}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {editingTemplate ? 'Actualizar' : 'Crear'} Template
                </button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Send Message Modal */}
      {showSendModal && selectedLead && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold">
                  Enviar mensaje a {selectedLead.name}
                </h2>
                <button
                  onClick={() => setShowSendModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Seleccionar Template (opcional)
                  </label>
                  <select
                    value={selectedTemplate?.id || ''}
                    onChange={(e) => {
                      const template = templates.find(t => t.id === e.target.value)
                      setSelectedTemplate(template || null)
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Sin template - Mensaje personalizado</option>
                    {templates.map(template => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedTemplate && selectedTemplate.variables.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-3">Variables del Template</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {selectedTemplate.variables.map(variable => (
                        <div key={variable}>
                          <label className="block text-xs text-gray-600 mb-1 capitalize">
                            {variable}
                          </label>
                          <input
                            type="text"
                            value={variables[variable] || ''}
                            onChange={(e) => setVariables(prev => ({
                              ...prev,
                              [variable]: e.target.value
                            }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                            placeholder={`Valor para {{${variable}}}`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!selectedTemplate && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Mensaje Personalizado
                    </label>
                    <textarea
                      value={customMessage}
                      onChange={(e) => setCustomMessage(e.target.value)}
                      rows={6}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                      placeholder="Escribe tu mensaje personalizado..."
                    />
                  </div>
                )}

                {(selectedTemplate || customMessage) && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Vista Previa</h3>
                    <div className="bg-gray-50 p-4 rounded-lg border">
                      <pre className="whitespace-pre-wrap text-sm text-gray-700">
                        {selectedTemplate ? previewContent : customMessage}
                      </pre>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-3 mt-6 pt-6 border-t">
                <button
                  onClick={() => setShowSendModal(false)}
                  className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancelar
                </button>
                
                <button
                  onClick={handleSendMessage}
                  disabled={sending || (!selectedTemplate && !customMessage)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  <Send className="h-4 w-4 mr-2" />
                  {sending ? 'Enviando...' : 'Enviar Mensaje'}
                </button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
