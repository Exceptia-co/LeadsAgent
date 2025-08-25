'use client'

import { useState, useEffect } from 'react'
import { Card } from '../ui/card'
import { X } from 'lucide-react'
import { Template } from './TemplateCard'

interface TemplateModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (templateData: any) => Promise<void>
  editingTemplate?: Template | null
}

interface TemplateForm {
  name: string
  category: string
  subject: string
  content: string
  variables: string[]
}

export default function TemplateModal({
  isOpen,
  onClose,
  onSave,
  editingTemplate
}: TemplateModalProps) {
  const [templateForm, setTemplateForm] = useState<TemplateForm>({
    name: '',
    category: '',
    subject: '',
    content: '',
    variables: []
  })
  const [templatePreview, setTemplatePreview] = useState('')
  const [templateVariables, setTemplateVariables] = useState<{ [key: string]: string }>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (editingTemplate) {
      setTemplateForm({
        name: editingTemplate.name,
        category: editingTemplate.category,
        subject: editingTemplate.subject || '',
        content: editingTemplate.content,
        variables: editingTemplate.variables || []
      })
    } else {
      setTemplateForm({
        name: '',
        category: '',
        subject: '',
        content: '',
        variables: []
      })
    }
    setTemplateVariables({})
    setTemplatePreview('')
  }, [editingTemplate, isOpen])

  useEffect(() => {
    if (templateForm.content) {
      generateTemplatePreview()
    }
  }, [templateForm.content, templateVariables])

  const extractVariables = (content: string): string[] => {
    const matches = content.match(/\{\{([^}]+)\}\}/g)
    if (!matches) return []
    
    return Array.from(new Set(matches.map(match => match.slice(2, -2).trim())))
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

  const handleSave = async () => {
    if (!templateForm.name || !templateForm.category || !templateForm.content) return
    
    setSaving(true)
    try {
      const variables = extractVariables(templateForm.content)
      const templateData = {
        ...templateForm,
        variables
      }
      await onSave(templateData)
      onClose()
    } catch (error) {
      console.error('Error saving template:', error)
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-white rounded-lg shadow-lg border">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold">
              {editingTemplate ? 'Editar Template' : 'Nuevo Template'}
            </h2>
            <button
              onClick={onClose}
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
              onClick={onClose}
              className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancelar
            </button>
            
            <button
              onClick={handleSave}
              disabled={saving || !templateForm.name || !templateForm.category || !templateForm.content}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Guardando...' : (editingTemplate ? 'Actualizar' : 'Crear')} Template
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
