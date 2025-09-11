'use client'

import { useState, useEffect } from 'react'
import { Card } from '../ui/card'
import { Badge } from '../ui/badge'
import { 
  Copy, 
  User, 
  Phone, 
  Mail, 
  Building, 
  Globe, 
  Calendar, 
  Clock,
  Sun,
  Smartphone,
  Tag,
  MapPin,
  Info,
  Zap
} from 'lucide-react'

interface Variable {
  key: string
  label: string
  description: string
  example: string
  category: 'lead' | 'system' | 'dynamic'
  icon?: React.ComponentType<{ className?: string }>
}

interface VariablePickerProps {
  onVariableSelect?: (variable: string) => void
  showExamples?: boolean
  compact?: boolean
}

export default function VariablePicker({ 
  onVariableSelect, 
  showExamples = true,
  compact = false 
}: VariablePickerProps) {
  const [availableVariables, setAvailableVariables] = useState<{
    lead: Variable[]
    system: Variable[]
    dynamic: Variable[]
  }>({
    lead: [],
    system: [],
    dynamic: []
  })
  const [examples, setExamples] = useState<any>({})
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'lead' | 'system' | 'dynamic'>('all')

  useEffect(() => {
    fetchAvailableVariables()
  }, [])

  const fetchAvailableVariables = async () => {
    try {
      const response = await fetch('http://localhost:3002/templates/variables')
      const result = await response.json()
      
      if (result.success) {
        // Mapear variables del backend a nuestro formato
        const leadVariables: Variable[] = [
          {
            key: 'nombre',
            label: 'Nombre del Lead',
            description: 'Nombre completo del lead',
            example: 'Juan Pérez',
            category: 'lead',
            icon: User
          },
          {
            key: 'telefono',
            label: 'Teléfono',
            description: 'Número de teléfono del lead',
            example: '+34 612 345 678',
            category: 'lead',
            icon: Phone
          },
          {
            key: 'email',
            label: 'Email',
            description: 'Dirección de email del lead',
            example: 'juan@example.com',
            category: 'lead',
            icon: Mail
          },
          {
            key: 'estado',
            label: 'Estado',
            description: 'Estado actual del lead',
            example: 'NUEVO, QUALIFIED',
            category: 'lead',
            icon: Tag
          },
          {
            key: 'origen',
            label: 'Origen',
            description: 'Fuente de origen del lead',
            example: 'website, referral',
            category: 'lead',
            icon: MapPin
          }
        ]

        const systemVariables: Variable[] = [
          {
            key: 'empresa',
            label: 'Empresa',
            description: 'Nombre de la empresa',
            example: 'EscortsHub',
            category: 'system',
            icon: Building
          },
          {
            key: 'sitio_web',
            label: 'Sitio Web',
            description: 'URL del sitio web',
            example: 'www.escortshub.net',
            category: 'system',
            icon: Globe
          },
          {
            key: 'telefono_soporte',
            label: 'Teléfono Soporte',
            description: 'Teléfono de atención al cliente',
            example: '+34 900 123 456',
            category: 'system',
            icon: Smartphone
          },
          {
            key: 'email_soporte',
            label: 'Email Soporte',
            description: 'Email de soporte técnico',
            example: 'soporte@escortshub.com',
            category: 'system',
            icon: Mail
          }
        ]

        const dynamicVariables: Variable[] = [
          {
            key: 'saludo',
            label: 'Saludo Automático',
            description: 'Saludo basado en la hora del día',
            example: 'Buenos días / Buenas tardes',
            category: 'dynamic',
            icon: Sun
          },
          {
            key: 'fecha_actual',
            label: 'Fecha Actual',
            description: 'Fecha de hoy',
            example: result.examples?.dynamic?.['{{fecha_actual}}'] || '28/08/2025',
            category: 'dynamic',
            icon: Calendar
          },
          {
            key: 'hora_actual',
            label: 'Hora Actual',
            description: 'Hora actual',
            example: result.examples?.dynamic?.['{{hora_actual}}'] || '14:30',
            category: 'dynamic',
            icon: Clock
          },
          {
            key: 'dia_semana',
            label: 'Día de la Semana',
            description: 'Día actual de la semana',
            example: result.examples?.dynamic?.['{{dia_semana}}'] || 'miércoles',
            category: 'dynamic',
            icon: Calendar
          },
          {
            key: 'mes_actual',
            label: 'Mes Actual',
            description: 'Mes actual',
            example: result.examples?.dynamic?.['{{mes_actual}}'] || 'agosto',
            category: 'dynamic',
            icon: Calendar
          }
        ]

        setAvailableVariables({
          lead: leadVariables,
          system: systemVariables,
          dynamic: dynamicVariables
        })
        
        setExamples(result.examples || {})
      }
    } catch (error) {
      console.error('Error fetching variables:', error)
      // Fallback a datos por defecto
      setAvailableVariables({
        lead: [
          { key: 'nombre', label: 'Nombre', description: 'Nombre del lead', example: 'Juan Pérez', category: 'lead', icon: User }
        ],
        system: [
          { key: 'empresa', label: 'Empresa', description: 'Nombre de la empresa', example: 'EscortsHub', category: 'system', icon: Building }
        ],
        dynamic: [
          { key: 'saludo', label: 'Saludo', description: 'Saludo automático', example: 'Buenos días', category: 'dynamic', icon: Sun }
        ]
      })
    } finally {
      setLoading(false)
    }
  }

  const handleVariableClick = (variableKey: string) => {
    const formattedVariable = `{{${variableKey}}}`
    
    if (onVariableSelect) {
      onVariableSelect(formattedVariable)
    } else {
      // Copy to clipboard
      navigator.clipboard.writeText(formattedVariable).then(() => {
        // Could show a toast notification here
        console.log('Variable copiada:', formattedVariable)
      })
    }
  }

  const getAllVariables = () => {
    return [
      ...availableVariables.lead,
      ...availableVariables.system,
      ...availableVariables.dynamic
    ]
  }

  const getFilteredVariables = () => {
    if (selectedCategory === 'all') {
      return getAllVariables()
    }
    return availableVariables[selectedCategory] || []
  }

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'lead': return <User className="h-4 w-4" />
      case 'system': return <Building className="h-4 w-4" />
      case 'dynamic': return <Zap className="h-4 w-4" />
      default: return <Tag className="h-4 w-4" />
    }
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'lead': return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'system': return 'bg-green-100 text-green-800 border-green-200'
      case 'dynamic': return 'bg-purple-100 text-purple-800 border-purple-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  if (loading) {
    return (
      <Card className="p-4">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-200 rounded w-1/3"></div>
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </Card>
    )
  }

  if (compact) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {getAllVariables().map(variable => (
            <button
              key={variable.key}
              onClick={() => handleVariableClick(variable.key)}
              className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors border border-blue-200"
              title={`${variable.description} (ej: ${variable.example})`}
            >
              {variable.icon && <variable.icon className="h-3 w-3 mr-1" />}
              {`{{${variable.key}}}`}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500">
          Haz clic en una variable para insertarla
        </p>
      </div>
    )
  }

  return (
    <Card className="p-4">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Variables Disponibles</h3>
            <p className="text-xs text-gray-500">
              {onVariableSelect ? 'Haz clic para insertar' : 'Haz clic para copiar'}
            </p>
          </div>
          <Badge variant="outline" className="text-xs">
            {getFilteredVariables().length} variables
          </Badge>
        </div>

        {/* Category Filter */}
        <div className="flex space-x-1 p-1 bg-gray-100 rounded-lg">
          {[
            { id: 'all', label: 'Todas', icon: Tag },
            { id: 'lead', label: 'Lead', icon: User },
            { id: 'system', label: 'Sistema', icon: Building },
            { id: 'dynamic', label: 'Dinámicas', icon: Zap }
          ].map(category => (
            <button
              key={category.id}
              onClick={() => setSelectedCategory(category.id as any)}
              className={`flex items-center px-2 py-1 text-xs font-medium rounded-md transition-colors ${
                selectedCategory === category.id
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <category.icon className="h-3 w-3 mr-1" />
              {category.label}
            </button>
          ))}
        </div>

        {/* Variables List */}
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {getFilteredVariables().map(variable => (
            <div
              key={variable.key}
              onClick={() => handleVariableClick(variable.key)}
              className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors group"
            >
              <div className="flex items-center space-x-3 flex-1">
                <div className={`p-1.5 rounded-md ${getCategoryColor(variable.category)}`}>
                  {variable.icon && <variable.icon className="h-3 w-3" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-medium text-gray-900 group-hover:text-blue-600">
                      {`{{${variable.key}}}`}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {variable.category}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-500 truncate">
                    {variable.description}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {showExamples && (
                  <div className="text-right">
                    <p className="text-xs text-gray-400">ej:</p>
                    <p className="text-xs text-gray-600 font-mono">
                      {variable.example}
                    </p>
                  </div>
                )}
                <Copy className="h-4 w-4 text-gray-400 group-hover:text-blue-600" />
              </div>
            </div>
          ))}
        </div>

        {getFilteredVariables().length === 0 && (
          <div className="text-center py-8">
            <Info className="mx-auto h-8 w-8 text-gray-300 mb-2" />
            <p className="text-sm text-gray-500">No hay variables en esta categoría</p>
          </div>
        )}
      </div>
    </Card>
  )
}
