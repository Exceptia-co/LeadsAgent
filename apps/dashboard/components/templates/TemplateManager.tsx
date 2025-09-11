'use client'

import { useState, useEffect } from 'react'
import { Card } from '../ui/card'
import { Search, Plus, FileText } from 'lucide-react'
import TemplateCard from './TemplateCard'
import TemplateModal from './TemplateModal'
import { useTemplates, Template } from '../../contexts/TemplateContext'
import { useToast } from '../ui/toast'

interface TemplateManagerProps {
  onUseTemplate?: (template: Template) => void
  onTemplatesChange?: () => void
}

export default function TemplateManager({ onUseTemplate, onTemplatesChange }: TemplateManagerProps) {
  const { templates, loading, createTemplate, updateTemplate, deleteTemplate } = useTemplates()
  const { showToast } = useToast()
  
  // Helper functions for different toast types
  const success = (title: string, description?: string) => {
    showToast({ type: 'success', title, description })
  }
  
  const showError = (title: string, description?: string) => {
    showToast({ type: 'error', title, description })
  }
  
  const [filteredTemplates, setFilteredTemplates] = useState<Template[]>([])
  const [templateSearch, setTemplateSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  
  // Modal states
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null)

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

  const handleSaveTemplate = async (templateData: any) => {
    try {
      let result = false
      if (editingTemplate) {
        result = await updateTemplate(editingTemplate.id, templateData)
      } else {
        result = await createTemplate(templateData)
      }
      
      if (result) {
        success(
          editingTemplate ? 'Template actualizado' : 'Template creado',
          'El template se ha guardado exitosamente'
        )
        closeTemplateModal()
        // Notify parent about templates change
        if (onTemplatesChange) {
          onTemplatesChange()
        }
      }
    } catch (error) {
      showError(
        'Error al guardar template',
        error instanceof Error ? error.message : 'Error desconocido'
      )
      throw error // Re-throw to prevent modal from closing
    }
  }

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este template?')) return
    
    const result = await deleteTemplate(id)
    if (result) {
      success('Template eliminado', 'El template ha sido eliminado exitosamente')
      // Notify parent about templates change
      if (onTemplatesChange) {
        onTemplatesChange()
      }
    }
  }

  const openEditTemplate = (template: Template) => {
    setEditingTemplate(template)
    setShowTemplateModal(true)
  }

  const openNewTemplate = () => {
    setEditingTemplate(null)
    setShowTemplateModal(true)
  }

  const closeTemplateModal = () => {
    setShowTemplateModal(false)
    setEditingTemplate(null)
  }

  const handleUseTemplate = (template: Template) => {
    if (onUseTemplate) {
      onUseTemplate(template)
    }
  }

  const categories = Array.from(new Set(templates.map(t => t.category))).filter(Boolean)

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-semibold text-gray-900">Templates</h2>
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Templates</h2>
          <p className="text-gray-500">Gestiona tus templates de mensajes</p>
        </div>
        <button
          onClick={openNewTemplate}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Template
        </button>
      </div>

      {/* Search and Filter */}
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
          <TemplateCard
            key={template.id}
            template={template}
            onEdit={openEditTemplate}
            onDelete={handleDeleteTemplate}
            onUse={handleUseTemplate}
          />
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
            onClick={openNewTemplate}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            Crear Template
          </button>
        </Card>
      )}

      {/* Template Modal */}
      <TemplateModal
        isOpen={showTemplateModal}
        onClose={closeTemplateModal}
        onSave={handleSaveTemplate}
        editingTemplate={editingTemplate}
      />
    </div>
  )
}
