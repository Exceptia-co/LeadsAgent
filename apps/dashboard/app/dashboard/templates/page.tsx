'use client'

import { useState, useEffect } from 'react'
import { Card } from '../../../components/ui/card'
import { Badge } from '../../../components/ui/badge'
import { 
  Plus, 
  Edit, 
  Trash2, 
  MessageSquare, 
  Search, 
  Eye,
  Save,
  X,
  Send
} from 'lucide-react'

interface Template {
  id: string
  name: string
  category: string
  subject?: string
  content: string
  variables: string[]
  usageCount: number
  isActive: boolean
  createdAt: string
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [previewTemplate, setPreviewTemplate] = useState<{ template: Template, variables: { [key: string]: string } } | null>(null)
  const [loading, setLoading] = useState(true)

  // Formulario para template
  const [formData, setFormData] = useState({
    name: '',
    category: 'welcome',
    subject: '',
    content: '',
    variables: '',
    isActive: true
  })

  const categories = [
    { id: 'all', label: 'Todas las categorías' },
    { id: 'welcome', label: 'Bienvenida' },
    { id: 'products', label: 'Productos' },
    { id: 'pricing', label: 'Precios' },
    { id: 'follow_up', label: 'Seguimiento' },
    { id: 'support', label: 'Soporte' }
  ]

  useEffect(() => {
    fetchTemplates()
  }, [])

  const fetchTemplates = async () => {
    setLoading(true)
    try {
      const response = await fetch('http://localhost:3002/templates')
      const result = await response.json()
      
      if (result.success) {
        setTemplates(result.data)
      }
    } catch (error) {
      console.error('Error fetching templates:', error)
      // Mock data para desarrollo
      setTemplates([
        {
          id: 'default_welcome',
          name: 'Mensaje de Bienvenida',
          category: 'welcome',
          subject: 'Bienvenido/a a EscortsHub',
          content: '¡Hola {{nombre}}! 👋\n\nBienvenido/a a EscortsHub, la plataforma líder de escorts en España.\n\nEstoy aquí para ayudarte con información sobre nuestros productos y servicios. ¿En qué puedo asistirte hoy?',
          variables: ['nombre'],
          usageCount: 45,
          isActive: true,
          createdAt: new Date().toISOString()
        },
        {
          id: 'default_product_intro',
          name: 'Introducción de Productos',
          category: 'products',
          subject: 'Nuestros Productos',
          content: 'Hola {{nombre}}, te cuento sobre nuestros principales productos:\n\n🔝 **ANUNCIO TOP**: Posición privilegiada\n📱 **ANUNCIO DOBLE**: Mayor visibilidad\n⭐ **DOBLE TOP**: Máxima exposición\n\n¿Te interesa conocer más detalles sobre alguno?',
          variables: ['nombre'],
          usageCount: 23,
          isActive: true,
          createdAt: new Date().toISOString()
        }
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleCreateTemplate = async () => {
    try {
      const variables = formData.variables.split(',').map(v => v.trim()).filter(v => v)
      
      const response = await fetch('http://localhost:3002/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          category: formData.category,
          subject: formData.subject,
          content: formData.content,
          variables
        })
      })
      
      const result = await response.json()
      
      if (result.success) {
        await fetchTemplates()
        resetForm()
        setIsCreating(false)
      }
    } catch (error) {
      console.error('Error creating template:', error)
    }
  }

  const handleUpdateTemplate = async () => {
    if (!editingTemplate) return
    
    try {
      const variables = formData.variables.split(',').map(v => v.trim()).filter(v => v)
      
      const response = await fetch(`http://localhost:3002/templates/${editingTemplate.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          category: formData.category,
          subject: formData.subject,
          content: formData.content,
          variables,
          isActive: formData.isActive
        })
      })
      
      if (response.ok) {
        await fetchTemplates()
        resetForm()
        setEditingTemplate(null)
      }
    } catch (error) {
      console.error('Error updating template:', error)
    }
  }

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este template?')) return
    
    try {
      const response = await fetch(`http://localhost:3002/templates/${id}`, {
        method: 'DELETE'
      })
      
      if (response.ok) {
        await fetchTemplates()
      }
    } catch (error) {
      console.error('Error deleting template:', error)
    }
  }

  const resetForm = () => {
    setFormData({
      name: '',
      category: 'welcome',
      subject: '',
      content: '',
      variables: '',
      isActive: true
    })
  }

  const startEditing = (template: Template) => {
    setEditingTemplate(template)
    setFormData({
      name: template.name,
      category: template.category,
      subject: template.subject || '',
      content: template.content,
      variables: template.variables.join(', '),
      isActive: template.isActive
    })
  }

  const filteredTemplates = templates.filter(template => {
    const matchesSearch = template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         template.content.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = selectedCategory === 'all' || template.category === selectedCategory
    return matchesSearch && matchesCategory
  })

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Templates de Mensajes</h1>
        <div className="animate-pulse grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="p-6">
              <div className="h-4 bg-gray-200 rounded mb-2"></div>
              <div className="h-20 bg-gray-200 rounded"></div>
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
          <h1 className="text-2xl font-bold text-gray-900">Templates de Mensajes</h1>
          <p className="text-gray-500">Gestiona plantillas para mensajes proactivos y automatizados</p>
        </div>
        
        <button
          onClick={() => {
            resetForm()
            setIsCreating(true)
          }}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4 mr-2" />
          Crear Template
        </button>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              placeholder="Buscar templates..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-3 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {categories.map(category => (
              <option key={category.id} value={category.id}>
                {category.label}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTemplates.map(template => (
          <Card key={template.id} className="p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">{template.name}</h3>
                <div className="flex items-center space-x-2">
                  <Badge variant="outline" className="text-xs">
                    {categories.find(c => c.id === template.category)?.label || template.category}
                  </Badge>
                  <Badge variant={template.isActive ? "success" : "secondary"} className="text-xs">
                    {template.isActive ? 'Activo' : 'Inactivo'}
                  </Badge>
                </div>
              </div>
            </div>

            <p className="text-sm text-gray-600 mb-4 line-clamp-3">
              {template.content.substring(0, 100)}...
            </p>

            <div className="flex items-center justify-between text-xs text-gray-500 mb-4">
              <span>Usado {template.usageCount} veces</span>
              <span>{template.variables.length} variables</span>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => setPreviewTemplate({ template, variables: {} })}
                className="flex items-center px-2 py-1 text-gray-600 hover:bg-gray-100 rounded text-xs"
                title="Vista previa"
              >
                <Eye className="h-3 w-3 mr-1" />
                Vista previa
              </button>
              
              <button
                onClick={() => startEditing(template)}
                className="flex items-center px-2 py-1 text-blue-600 hover:bg-blue-50 rounded text-xs"
                title="Editar"
              >
                <Edit className="h-3 w-3 mr-1" />
                Editar
              </button>
              
              <button
                onClick={() => handleDeleteTemplate(template.id)}
                className="flex items-center px-2 py-1 text-red-600 hover:bg-red-50 rounded text-xs"
                title="Eliminar"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Eliminar
              </button>
            </div>
          </Card>
        ))}
      </div>

      {filteredTemplates.length === 0 && (
        <Card className="p-12 text-center">
          <MessageSquare className="mx-auto h-12 w-12 text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No hay templates</h3>
          <p className="text-gray-500 mb-4">
            {searchTerm || selectedCategory !== 'all' 
              ? 'No se encontraron templates con los filtros aplicados.'
              : 'Crea tu primer template para empezar a gestionar mensajes.'
            }
          </p>
          {(!searchTerm && selectedCategory === 'all') && (
            <button
              onClick={() => {
                resetForm()
                setIsCreating(true)
              }}
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              Crear Primer Template
            </button>
          )}
        </Card>
      )}

      {/* Create/Edit Modal */}
      {(isCreating || editingTemplate) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold">
                  {isCreating ? 'Crear Template' : 'Editar Template'}
                </h2>
                <button
                  onClick={() => {
                    setIsCreating(false)
                    setEditingTemplate(null)
                    resetForm()
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Nombre del Template
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Nombre descriptivo..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Categoría
                    </label>
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      {categories.slice(1).map(category => (
                        <option key={category.id} value={category.id}>
                          {category.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Asunto (opcional)
                  </label>
                  <input
                    type="text"
                    value={formData.subject}
                    onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Asunto del mensaje..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Contenido del Mensaje
                  </label>
                  <textarea
                    value={formData.content}
                    onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                    rows={6}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                    placeholder="Contenido del mensaje... Usa {{variable}} para variables dinámicas."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Variables (separadas por comas)
                  </label>
                  <input
                    type="text"
                    value={formData.variables}
                    onChange={(e) => setFormData(prev => ({ ...prev, variables: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="nombre, telefono, email, servicio..."
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Las variables se reemplazarán automáticamente con datos del lead
                  </p>
                </div>

                {editingTemplate && (
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="isActive"
                      checked={formData.isActive}
                      onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                      className="mr-2"
                    />
                    <label htmlFor="isActive" className="text-sm text-gray-700">
                      Template activo
                    </label>
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-3 mt-6 pt-6 border-t">
                <button
                  onClick={() => {
                    setIsCreating(false)
                    setEditingTemplate(null)
                    resetForm()
                  }}
                  className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancelar
                </button>
                
                <button
                  onClick={isCreating ? handleCreateTemplate : handleUpdateTemplate}
                  disabled={!formData.name || !formData.content}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {isCreating ? 'Crear' : 'Actualizar'}
                </button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Preview Modal */}
      {previewTemplate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Vista Previa</h2>
                <button
                  onClick={() => setPreviewTemplate(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="font-medium text-gray-900">{previewTemplate.template.name}</h3>
                  <Badge variant="outline" className="text-xs mt-1">
                    {categories.find(c => c.id === previewTemplate.template.category)?.label}
                  </Badge>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg">
                  <pre className="whitespace-pre-wrap text-sm text-gray-700">
                    {previewTemplate.template.content}
                  </pre>
                </div>

                {previewTemplate.template.variables.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">Variables disponibles:</p>
                    <div className="flex flex-wrap gap-2">
                      {previewTemplate.template.variables.map(variable => (
                        <Badge key={variable} variant="secondary" className="text-xs">
                          {`{{${variable}}}`}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end mt-6 pt-4 border-t">
                <button
                  onClick={() => setPreviewTemplate(null)}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
