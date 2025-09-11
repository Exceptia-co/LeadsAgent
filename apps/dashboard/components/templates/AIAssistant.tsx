'use client'

import { useState } from 'react'
import { Card } from '../ui/card'
import { Badge } from '../ui/badge'
import { 
  Sparkles, 
  Wand2, 
  RefreshCw, 
  Copy, 
  ArrowRight,
  Lightbulb,
  MessageSquare,
  Target,
  Palette,
  AlignLeft,
  TrendingUp,
  Clock,
  X,
  Check,
  Loader2
} from 'lucide-react'

interface AIAssistantProps {
  onTemplateGenerated?: (template: any) => void
  onContentGenerated?: (content: string) => void
  onClose?: () => void
  mode?: 'template' | 'improve' | 'proactive'
  existingContent?: string
  leadData?: any
}

interface AIGenerationForm {
  category: string
  objective: string
  tone: string
  length: string
  context: string
  improvements: string[]
}

export default function AIAssistant({ 
  onTemplateGenerated,
  onContentGenerated,
  onClose,
  mode = 'template',
  existingContent = '',
  leadData = null
}: AIAssistantProps) {
  const [step, setStep] = useState(1)
  const [formData, setFormData] = useState<AIGenerationForm>({
    category: 'welcome',
    objective: '',
    tone: 'profesional',
    length: 'medio',
    context: '',
    improvements: []
  })
  const [generating, setGenerating] = useState(false)
  const [generatedResult, setGeneratedResult] = useState<any>(null)
  const [error, setError] = useState('')

  const categories = [
    { id: 'welcome', label: 'Bienvenida', description: 'Mensajes de presentación y primer contacto' },
    { id: 'products', label: 'Productos', description: 'Información sobre servicios y productos' },
    { id: 'pricing', label: 'Precios', description: 'Información de precios y paquetes' },
    { id: 'follow_up', label: 'Seguimiento', description: 'Mensajes de seguimiento post-contacto' },
    { id: 'support', label: 'Soporte', description: 'Atención al cliente y resolución de dudas' },
    { id: 'promotion', label: 'Promoción', description: 'Ofertas especiales y promociones' }
  ]

  const tones = [
    { id: 'profesional', label: 'Profesional', icon: '🏢', description: 'Formal y serio' },
    { id: 'amigable', label: 'Amigable', icon: '😊', description: 'Cercano y cálido' },
    { id: 'persuasivo', label: 'Persuasivo', icon: '🎯', description: 'Enfocado en conversión' },
    { id: 'informativo', label: 'Informativo', icon: '📋', description: 'Educativo y claro' },
    { id: 'urgente', label: 'Urgente', icon: '⚡', description: 'Con llamada a la acción' }
  ]

  const lengths = [
    { id: 'corto', label: 'Corto', description: '1-2 párrafos (30-50 palabras)' },
    { id: 'medio', label: 'Medio', description: '2-3 párrafos (50-100 palabras)' },
    { id: 'largo', label: 'Largo', description: '3-4 párrafos (100+ palabras)' }
  ]

  const commonImprovements = [
    'Añadir más emojis relevantes',
    'Mejorar el call-to-action',
    'Hacer más personalizado',
    'Aumentar la urgencia',
    'Ser más específico',
    'Simplificar el lenguaje',
    'Añadir beneficios específicos',
    'Incluir prueba social'
  ]

  const handleGenerate = async () => {
    setGenerating(true)
    setError('')
    
    try {
      let endpoint = '/templates/ai-suggest'
      let payload: any = {
        category: formData.category,
        objective: formData.objective,
        tone: formData.tone,
        length: formData.length,
        context: formData.context
      }

      if (mode === 'improve') {
        endpoint = '/templates/ai-improve'
        payload = {
          content: existingContent,
          improvements: formData.improvements,
          tone: formData.tone,
          objective: formData.objective
        }
      } else if (mode === 'proactive') {
        endpoint = '/proactive-messages/ai-generate'
        payload = {
          leadId: leadData?.id,
          objective: formData.objective,
          tone: formData.tone,
          context: formData.context,
          includeOffer: formData.improvements.includes('Añadir beneficios específicos'),
          urgency: formData.improvements.includes('Aumentar la urgencia') ? 'high' : 'normal'
        }
      }

      const response = await fetch(`http://localhost:3002${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const result = await response.json()

      if (result.success) {
        setGeneratedResult(result.data)
        setStep(3)
      } else {
        setError(result.error || 'Error al generar contenido')
      }
    } catch (error) {
      console.error('Error generating content:', error)
      setError('Error de conexión. Verifica que el servicio esté disponible.')
    } finally {
      setGenerating(false)
    }
  }

  const handleUseGenerated = () => {
    if (mode === 'template' && onTemplateGenerated) {
      onTemplateGenerated(generatedResult)
    } else if (onContentGenerated) {
      const content = generatedResult?.improved || generatedResult?.content || generatedResult?.name
      onContentGenerated(content)
    }
    
    if (onClose) onClose()
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      // Could show a toast notification here
      console.log('Contenido copiado al portapapeles')
    })
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[100] p-4">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-white shadow-2xl border-2 border-gray-200">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-gradient-to-r from-purple-600 to-blue-600 rounded-lg">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  Asistente IA para Templates
                </h2>
                <p className="text-sm text-gray-500">
                  {mode === 'template' && 'Crea templates efectivos con inteligencia artificial'}
                  {mode === 'improve' && 'Mejora tu contenido existente con IA'}
                  {mode === 'proactive' && 'Genera mensajes personalizados para leads'}
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

          {/* Progress Steps */}
          <div className="flex items-center justify-center mb-8">
            <div className="flex items-center space-x-4">
              {[
                { num: 1, label: 'Configurar', icon: Target },
                { num: 2, label: 'Generar', icon: Wand2 },
                { num: 3, label: 'Revisar', icon: Check }
              ].map((stepInfo, index) => (
                <div key={stepInfo.num} className="flex items-center">
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
                    step >= stepInfo.num 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-200 text-gray-500'
                  }`}>
                    {step > stepInfo.num ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <stepInfo.icon className="h-4 w-4" />
                    )}
                  </div>
                  <span className="ml-2 text-sm font-medium text-gray-600">
                    {stepInfo.label}
                  </span>
                  {index < 2 && (
                    <ArrowRight className="h-4 w-4 text-gray-300 ml-4" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Step 1: Configuration */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Category Selection */}
                {mode === 'template' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      <MessageSquare className="inline h-4 w-4 mr-2" />
                      Categoría del Mensaje
                    </label>
                    <div className="grid grid-cols-1 gap-2">
                      {categories.map(category => (
                        <label key={category.id} className="cursor-pointer">
                          <input
                            type="radio"
                            name="category"
                            value={category.id}
                            checked={formData.category === category.id}
                            onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                            className="sr-only"
                          />
                          <div className={`p-3 border rounded-lg transition-colors ${
                            formData.category === category.id
                              ? 'border-blue-500 bg-blue-50 text-blue-900'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}>
                            <div className="font-medium">{category.label}</div>
                            <div className="text-xs text-gray-500">{category.description}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Objective */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Target className="inline h-4 w-4 mr-2" />
                    Objetivo del Mensaje
                  </label>
                  <textarea
                    value={formData.objective}
                    onChange={(e) => setFormData(prev => ({ ...prev, objective: e.target.value }))}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Ej: Dar la bienvenida a nuevos usuarios y explicar los beneficios de la plataforma"
                  />
                  
                  {/* Quick suggestions */}
                  <div className="mt-2">
                    <p className="text-xs text-gray-500 mb-2">Sugerencias rápidas:</p>
                    <div className="flex flex-wrap gap-1">
                      {[
                        'Generar interés en productos',
                        'Explicar proceso de registro',
                        'Ofrecer promoción especial',
                        'Resolver dudas frecuentes',
                        'Invitar a contactar soporte'
                      ].map(suggestion => (
                        <button
                          key={suggestion}
                          onClick={() => setFormData(prev => ({ ...prev, objective: suggestion }))}
                          className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Tone and Length */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    <Palette className="inline h-4 w-4 mr-2" />
                    Tono del Mensaje
                  </label>
                  <div className="grid grid-cols-1 gap-2">
                    {tones.map(tone => (
                      <label key={tone.id} className="cursor-pointer">
                        <input
                          type="radio"
                          name="tone"
                          value={tone.id}
                          checked={formData.tone === tone.id}
                          onChange={(e) => setFormData(prev => ({ ...prev, tone: e.target.value }))}
                          className="sr-only"
                        />
                        <div className={`p-3 border rounded-lg transition-colors ${
                          formData.tone === tone.id
                            ? 'border-blue-500 bg-blue-50 text-blue-900'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}>
                          <div className="flex items-center">
                            <span className="text-lg mr-2">{tone.icon}</span>
                            <div>
                              <div className="font-medium">{tone.label}</div>
                              <div className="text-xs text-gray-500">{tone.description}</div>
                            </div>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    <AlignLeft className="inline h-4 w-4 mr-2" />
                    Longitud del Mensaje
                  </label>
                  <div className="space-y-2">
                    {lengths.map(length => (
                      <label key={length.id} className="cursor-pointer block">
                        <input
                          type="radio"
                          name="length"
                          value={length.id}
                          checked={formData.length === length.id}
                          onChange={(e) => setFormData(prev => ({ ...prev, length: e.target.value }))}
                          className="sr-only"
                        />
                        <div className={`p-3 border rounded-lg transition-colors ${
                          formData.length === length.id
                            ? 'border-blue-500 bg-blue-50 text-blue-900'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}>
                          <div className="font-medium">{length.label}</div>
                          <div className="text-xs text-gray-500">{length.description}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Improvements for improve mode */}
              {mode === 'improve' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    <TrendingUp className="inline h-4 w-4 mr-2" />
                    ¿Qué aspectos quieres mejorar?
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {commonImprovements.map(improvement => (
                      <label key={improvement} className="cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.improvements.includes(improvement)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFormData(prev => ({
                                ...prev,
                                improvements: [...prev.improvements, improvement]
                              }))
                            } else {
                              setFormData(prev => ({
                                ...prev,
                                improvements: prev.improvements.filter(imp => imp !== improvement)
                              }))
                            }
                          }}
                          className="sr-only"
                        />
                        <div className={`p-2 border rounded-lg text-center transition-colors ${
                          formData.improvements.includes(improvement)
                            ? 'border-blue-500 bg-blue-50 text-blue-900'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}>
                          <div className="text-xs font-medium">{improvement}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Additional Context */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Lightbulb className="inline h-4 w-4 mr-2" />
                  Contexto Adicional (opcional)
                </label>
                <textarea
                  value={formData.context}
                  onChange={(e) => setFormData(prev => ({ ...prev, context: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Información adicional que puede ser útil para generar el mensaje..."
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => setStep(2)}
                  disabled={!formData.objective}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  Continuar
                  <ArrowRight className="h-4 w-4 ml-2" />
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Generation */}
          {step === 2 && (
            <div className="text-center space-y-6">
              {!generating && !error && (
                <>
                  <div className="max-w-md mx-auto">
                    <div className="p-6 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border">
                      <Wand2 className="h-12 w-12 text-purple-600 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        ¿Listo para generar?
                      </h3>
                      <p className="text-gray-600 mb-4">
                        La IA creará contenido basado en tus especificaciones:
                      </p>
                      <div className="text-left space-y-2 text-sm">
                        {mode === 'template' && (
                          <div><strong>Categoría:</strong> {categories.find(c => c.id === formData.category)?.label}</div>
                        )}
                        <div><strong>Objetivo:</strong> {formData.objective}</div>
                        <div><strong>Tono:</strong> {tones.find(t => t.id === formData.tone)?.label}</div>
                        <div><strong>Longitud:</strong> {lengths.find(l => l.id === formData.length)?.label}</div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex justify-center space-x-3">
                    <button
                      onClick={() => setStep(1)}
                      className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      Volver
                    </button>
                    <button
                      onClick={handleGenerate}
                      className="px-6 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 flex items-center"
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      Generar con IA
                    </button>
                  </div>
                </>
              )}

              {generating && (
                <div className="max-w-md mx-auto">
                  <div className="p-8 bg-gray-50 rounded-lg">
                    <Loader2 className="h-12 w-12 text-blue-600 mx-auto mb-4 animate-spin" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      Generando contenido...
                    </h3>
                    <p className="text-gray-600">
                      La IA está creando tu {mode === 'template' ? 'template' : 'contenido'} personalizado.
                      Esto puede tomar unos segundos.
                    </p>
                  </div>
                </div>
              )}

              {error && (
                <div className="max-w-md mx-auto">
                  <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
                    <div className="text-red-600 text-center">
                      <h3 className="font-semibold mb-2">Error al generar</h3>
                      <p className="text-sm mb-4">{error}</p>
                      <button
                        onClick={() => setError('')}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                      >
                        Reintentar
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Results */}
          {step === 3 && generatedResult && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="inline-flex items-center px-4 py-2 bg-green-100 text-green-800 rounded-full text-sm font-medium mb-4">
                  <Check className="h-4 w-4 mr-2" />
                  Contenido generado exitosamente
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Generated Content */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {mode === 'template' ? 'Template Generado' : 'Contenido Mejorado'}
                    </h3>
                    <button
                      onClick={() => copyToClipboard(generatedResult.content || generatedResult.improved)}
                      className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                      title="Copiar al portapapeles"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                  
                  <div className="bg-gray-50 border rounded-lg p-4 min-h-[200px]">
                    <pre className="whitespace-pre-wrap text-sm text-gray-700">
                      {generatedResult.content || generatedResult.improved}
                    </pre>
                  </div>

                  {generatedResult.variables && generatedResult.variables.length > 0 && (
                    <div className="mt-3">
                      <p className="text-sm font-medium text-gray-700 mb-2">Variables detectadas:</p>
                      <div className="flex flex-wrap gap-2">
                        {generatedResult.variables.map((variable: string) => (
                          <Badge key={variable} variant="secondary" className="text-xs">
                            {`{{${variable}}}`}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Metadata and Actions */}
                <div className="space-y-4">
                  {mode === 'template' && (
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2">Información del Template</h4>
                      <div className="bg-white border rounded-lg p-4 space-y-3">
                        <div>
                          <label className="text-xs text-gray-500">Nombre Sugerido:</label>
                          <p className="font-medium">{generatedResult.name}</p>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">Categoría:</label>
                          <p className="capitalize">{generatedResult.category}</p>
                        </div>
                        {generatedResult.subject && (
                          <div>
                            <label className="text-xs text-gray-500">Asunto:</label>
                            <p>{generatedResult.subject}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {mode === 'improve' && generatedResult.changes && (
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2">Cambios Realizados</h4>
                      <div className="bg-white border rounded-lg p-4 space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span>Cambio de longitud:</span>
                          <span className={generatedResult.changes.lengthChange > 0 ? 'text-green-600' : 'text-red-600'}>
                            {generatedResult.changes.lengthChange > 0 ? '+' : ''}{generatedResult.changes.lengthChange} caracteres
                          </span>
                        </div>
                        {generatedResult.changes.addedVariables?.length > 0 && (
                          <div>
                            <span className="text-green-600">Variables añadidas:</span>
                            <div className="mt-1">
                              {generatedResult.changes.addedVariables.map((variable: string) => (
                                <Badge key={variable} variant="secondary" className="text-xs mr-1">
                                  {`{{${variable}}}`}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Metadatos</h4>
                    <div className="bg-white border rounded-lg p-4 text-sm space-y-2">
                      <div className="flex justify-between">
                        <span>Proveedor IA:</span>
                        <span className="font-medium">{generatedResult.metadata?.aiProvider || 'openrouter'}</span>
                      </div>
                      {generatedResult.metadata?.tokensUsed && (
                        <div className="flex justify-between">
                          <span>Tokens usados:</span>
                          <span>{generatedResult.metadata.tokensUsed}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span>Generado:</span>
                        <span>{new Date().toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center pt-4 border-t">
                <button
                  onClick={() => handleGenerate()}
                  disabled={generating}
                  className="px-4 py-2 text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50 flex items-center"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Regenerar
                </button>
                
                <div className="flex space-x-3">
                  <button
                    onClick={() => copyToClipboard(generatedResult.content || generatedResult.improved)}
                    className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center"
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copiar
                  </button>
                  
                  <button
                    onClick={handleUseGenerated}
                    className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center"
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Usar Este {mode === 'template' ? 'Template' : 'Contenido'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
