'use client'

import { useState } from 'react'
import { Card } from '../../../components/ui/card'
import { Badge } from '../../../components/ui/badge'
import { useAIProvider } from '../../../hooks/use-ai-provider'
import { useAIStats } from '../../../hooks/use-ai-stats'
import { 
  Brain, 
  Zap, 
  Activity, 
  Send, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  BarChart3,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  Bot,
  Trash2,
  Play,
  Settings,
  BookOpen,
  MessageSquare,
  Save,
  Plus,
  Edit,
  Search
} from 'lucide-react'

export default function AIAssistantPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'test' | 'history' | 'analytics' | 'config' | 'knowledge'>('overview')
  const [testMessage, setTestMessage] = useState('')
  
  // Configuration states
  const [systemPrompt, setSystemPrompt] = useState('')
  const [temperature, setTemperature] = useState(0.7)
  const [maxTokens, setMaxTokens] = useState(150)
  const [minDelay, setMinDelay] = useState(2)
  const [maxDelay, setMaxDelay] = useState(6)
  
  // Knowledge base states
  const [knowledgeEntries, setKnowledgeEntries] = useState<any[]>([])
  const [newEntry, setNewEntry] = useState({ category: '', title: '', content: '', keywords: '' })
  const [editingEntry, setEditingEntry] = useState<any>(null)
  const [searchTerm, setSearchTerm] = useState('')
  
  const {
    status,
    providers,
    testHistory,
    isLoading,
    isTesting,
    isSwitching,
    error,
    fetchStatus,
    switchProvider,
    testAI,
    clearTestHistory
  } = useAIProvider()

  const {
    stats,
    isLoading: statsLoading,
    getEstimatedCosts,
    performanceMetrics
  } = useAIStats()

  const handleTestSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!testMessage.trim()) return

    await testAI({ message: testMessage.trim() })
    setTestMessage('')
  }

  const formatTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 4
    }).format(amount)
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">IA Assistant</h1>
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
          <h1 className="text-2xl font-bold text-gray-900">IA Assistant</h1>
          <p className="text-gray-500">Gestiona y supervisa los proveedores de inteligencia artificial</p>
        </div>
        <div className="flex items-center space-x-2">
          {error && (
            <div className="flex items-center px-3 py-1 bg-red-100 text-red-700 rounded-lg text-sm">
              <AlertTriangle className="h-4 w-4 mr-1" />
              Error de conexión
            </div>
          )}
          <button
            onClick={fetchStatus}
            className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
            title="Actualizar estado"
          >
            <RefreshCw className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'overview', label: 'Resumen', icon: Brain },
            { id: 'config', label: 'Configuración', icon: Settings },
            { id: 'knowledge', label: 'Knowledge Base', icon: BookOpen },
            { id: 'test', label: 'Probar IA', icon: Play },
            { id: 'history', label: 'Historial', icon: Clock },
            { id: 'analytics', label: 'Analíticas', icon: BarChart3 }
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as any)}
              className={`flex items-center py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Icon className="h-4 w-4 mr-2" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Provider Status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {providers.map((provider) => (
              <Card key={provider.id} className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center">
                    <div className={`p-3 rounded-full mr-4 ${
                      provider.isActive ? 'bg-green-100' : 'bg-gray-100'
                    }`}>
                      <Brain className={`h-6 w-6 ${
                        provider.isActive ? 'text-green-600' : 'text-gray-600'
                      }`} />
                    </div>
                    <div>
                      <h3 className="text-lg font-medium text-gray-900">{provider.name}</h3>
                      <p className="text-sm text-gray-500">{provider.description}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end space-y-2">
                    <Badge variant={provider.isActive ? "default" : "secondary"}>
                      {provider.isActive ? 'Activo' : 'Inactivo'}
                    </Badge>
                    <Badge variant={provider.isConfigured ? "success" : "destructive"}>
                      {provider.isConfigured ? 'Configurado' : 'Sin configurar'}
                    </Badge>
                  </div>
                </div>
                
                <div className="mt-4">
                  <p className="text-xs text-gray-500 mb-2">Modelos disponibles:</p>
                  <div className="flex flex-wrap gap-1">
                    {provider.models.slice(0, 2).map((model) => (
                      <Badge key={model} variant="outline" className="text-xs">
                        {model.split('/').pop()}
                      </Badge>
                    ))}
                    {provider.models.length > 2 && (
                      <Badge variant="outline" className="text-xs">
                        +{provider.models.length - 2} más
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t">
                  <button
                    onClick={() => switchProvider(provider.id)}
                    disabled={isSwitching || provider.isActive || !provider.isConfigured}
                    className={`w-full px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      provider.isActive
                        ? 'bg-green-100 text-green-800 cursor-not-allowed'
                        : provider.isConfigured
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {isSwitching 
                      ? 'Cambiando...' 
                      : provider.isActive 
                      ? 'Proveedor Activo'
                      : provider.isConfigured
                      ? 'Activar Proveedor'
                      : 'Requiere Configuración'
                    }
                  </button>
                </div>
              </Card>
            ))}
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="p-4">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Activity className="h-8 w-8 text-blue-500" />
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-500">Respuestas IA</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {stats?.aiResponses || 0}
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Zap className="h-8 w-8 text-yellow-500" />
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-500">Tokens Promedio</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {Math.round(stats?.averageTokens || 0)}
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <TrendingUp className="h-8 w-8 text-green-500" />
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-500">Tasa de Éxito</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {stats?.successRate?.toFixed(1) || 0}%
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <DollarSign className="h-8 w-8 text-purple-500" />
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-500">Costo Estimado</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {formatCurrency(getEstimatedCosts?.total || 0)}
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {activeTab === 'test' && (
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              <Play className="inline h-5 w-5 mr-2" />
              Probar Respuesta de IA
            </h2>
            
            <form onSubmit={handleTestSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Mensaje de prueba
                </label>
                <textarea
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  placeholder="Escribe un mensaje para probar la respuesta de la IA..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                  rows={4}
                  required
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-500">
                  Proveedor activo: <span className="font-medium">{status?.currentProvider || 'N/A'}</span>
                </div>
                <button
                  type="submit"
                  disabled={isTesting || !testMessage.trim() || !status?.currentProvider}
                  className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Send className="h-4 w-4 mr-2" />
                  {isTesting ? 'Probando...' : 'Probar IA'}
                </button>
              </div>
            </form>
            
            {/* Latest test result */}
            {testHistory.length > 0 && (
              <div className="mt-6 pt-6 border-t">
                <h3 className="text-sm font-medium text-gray-900 mb-3">Última respuesta:</h3>
                <div className={`p-4 rounded-lg border ${
                  testHistory[0].success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                }`}>
                  {testHistory[0].success ? (
                    <div className="space-y-2">
                      <p className="text-sm text-gray-700">{testHistory[0].response}</p>
                      <div className="flex items-center space-x-4 text-xs text-gray-500">
                        <span>Proveedor: {testHistory[0].provider}</span>
                        <span>Tokens: {testHistory[0].tokens}</span>
                        <span>Tiempo: {formatTime(testHistory[0].responseTime)}</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-red-700">Error: {testHistory[0].error}</p>
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-gray-900">
                <Clock className="inline h-5 w-5 mr-2" />
                Historial de Pruebas ({testHistory.length})
              </h2>
              {testHistory.length > 0 && (
                <button
                  onClick={clearTestHistory}
                  className="flex items-center px-3 py-1 text-red-600 hover:bg-red-50 rounded-lg text-sm transition-colors"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Limpiar
                </button>
              )}
            </div>

            {testHistory.length > 0 ? (
              <div className="space-y-4">
                {testHistory.map((test) => (
                  <div key={test.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        {test.success ? (
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                        ) : (
                          <XCircle className="h-5 w-5 text-red-500" />
                        )}
                        <span className="text-sm font-medium text-gray-900">
                          {new Date(test.timestamp).toLocaleString('es-ES')}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge variant="outline" className="text-xs">
                          {test.provider}
                        </Badge>
                        {test.success && (
                          <Badge variant="secondary" className="text-xs">
                            {formatTime(test.responseTime)}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="bg-gray-50 p-3 rounded">
                        <p className="text-sm text-gray-700"><strong>Pregunta:</strong> {test.message}</p>
                      </div>
                      
                      {test.success ? (
                        <div className="bg-blue-50 p-3 rounded">
                          <p className="text-sm text-gray-700"><strong>Respuesta:</strong> {test.response}</p>
                          <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                            <span>Modelo: {test.model}</span>
                            <span>Tokens: {test.tokens}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-red-50 p-3 rounded">
                          <p className="text-sm text-red-700"><strong>Error:</strong> {test.error}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Bot className="mx-auto h-12 w-12 text-gray-300 mb-4" />
                <p className="text-gray-500">No hay pruebas realizadas</p>
                <p className="text-sm text-gray-400 mt-2">
                  Las pruebas que realices aparecerán aquí
                </p>
              </div>
            )}
          </Card>
        </div>
      )}

      {activeTab === 'analytics' && (
        <div className="space-y-6">
          {/* Performance Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-4">
              <div className="text-center">
                <p className="text-sm text-gray-500">Tiempo Promedio</p>
                <p className="text-2xl font-bold text-blue-600">
                  {performanceMetrics ? formatTime(performanceMetrics.avgResponseTime) : 'N/A'}
                </p>
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-center">
                <p className="text-sm text-gray-500">Requests Totales</p>
                <p className="text-2xl font-bold text-green-600">
                  {performanceMetrics?.totalRequests || 0}
                </p>
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-center">
                <p className="text-sm text-gray-500">Tokens/Min</p>
                <p className="text-2xl font-bold text-purple-600">
                  {performanceMetrics ? Math.round(performanceMetrics.tokensPerMinute) : 0}
                </p>
              </div>
            </Card>
          </div>

          {/* Provider Breakdown */}
          <Card className="p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Distribución por Proveedor</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-4 h-4 bg-blue-500 rounded mr-3"></div>
                  <span className="text-sm text-gray-700">OpenRouter</span>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">{stats?.providerBreakdown.openrouter || 0}</p>
                  <p className="text-xs text-gray-500">
                    {formatCurrency(getEstimatedCosts?.breakdown.openrouter || 0)}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-4 h-4 bg-green-500 rounded mr-3"></div>
                  <span className="text-sm text-gray-700">Google Gemini</span>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">{stats?.providerBreakdown.gemini || 0}</p>
                  <p className="text-xs text-gray-500">
                    {formatCurrency(getEstimatedCosts?.breakdown.gemini || 0)}
                  </p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'config' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* System Prompt Configuration */}
            <Card className="p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                <Settings className="inline h-5 w-5 mr-2" />
                System Prompt
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Prompt del Sistema
                  </label>
                  <textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    placeholder="Eres un asistente virtual especializado en EscortsHub. Responde de manera profesional y útil..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                    rows={6}
                  />
                </div>
                
                <button className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                  <Save className="h-4 w-4 mr-2" />
                  Guardar Prompt
                </button>
              </div>
            </Card>

            {/* AI Parameters */}
            <Card className="p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                <Zap className="inline h-5 w-5 mr-2" />
                Parámetros de IA
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Temperatura ({temperature})
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Conservador</span>
                    <span>Creativo</span>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Máximo de Tokens
                  </label>
                  <input
                    type="number"
                    min="50"
                    max="500"
                    value={maxTokens}
                    onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </Card>
          </div>
          
          {/* Humanization Settings */}
          <Card className="p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              <Clock className="inline h-5 w-5 mr-2" />
              Configuración de Humanización
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Delay Mínimo (segundos)
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={minDelay}
                  onChange={(e) => setMinDelay(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Delay Máximo (segundos)
                </label>
                <input
                  type="number"
                  min="2"
                  max="15"
                  value={maxDelay}
                  onChange={(e) => setMaxDelay(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">
                El delay se calcula automáticamente basado en la longitud del mensaje, 
                entre {minDelay} y {maxDelay} segundos para simular escritura humana.
              </p>
            </div>
            
            <div className="flex justify-end mt-4">
              <button className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                <Save className="h-4 w-4 mr-2" />
                Guardar Configuración
              </button>
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'knowledge' && (
        <div className="space-y-6">
          {/* Search and Add */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-gray-900">
                <BookOpen className="inline h-5 w-5 mr-2" />
                Base de Conocimiento
              </h2>
              
              <div className="flex items-center space-x-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <input
                    type="text"
                    placeholder="Buscar entradas..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <button 
                  onClick={() => setEditingEntry({ category: '', title: '', content: '', keywords: '', priority: 1 })}
                  className="flex items-center px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Agregar
                </button>
              </div>
            </div>
            
            {/* Knowledge entries list */}
            <div className="space-y-3">
              {[
                { id: 1, category: 'Productos', title: 'Anuncio Doble', content: 'El Anuncio Doble permite mayor visibilidad...', keywords: ['anuncio', 'doble', 'visibilidad'] },
                { id: 2, category: 'Precios', title: 'Moneda HUB', content: 'La moneda HUB se usa para todos los pagos...', keywords: ['hub', 'moneda', 'pago'] },
                { id: 3, category: 'General', title: 'Soporte al Cliente', content: 'Nuestro equipo de soporte está disponible...', keywords: ['soporte', 'ayuda', 'contacto'] }
              ].filter(entry => 
                searchTerm === '' || 
                entry.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                entry.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
                entry.keywords.some(k => k.toLowerCase().includes(searchTerm.toLowerCase()))
              ).map((entry) => (
                <div key={entry.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <Badge variant="outline" className="text-xs">
                          {entry.category}
                        </Badge>
                        <h3 className="font-medium text-gray-900">{entry.title}</h3>
                      </div>
                      <p className="text-sm text-gray-600 mb-2">
                        {entry.content.substring(0, 100)}...
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {entry.keywords.map((keyword) => (
                          <Badge key={keyword} variant="secondary" className="text-xs">
                            {keyword}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2 ml-4">
                      <button 
                        onClick={() => setEditingEntry(entry)}
                        className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
          
          {/* Add/Edit Form */}
          {editingEntry && (
            <Card className="p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                {editingEntry.id ? 'Editar Entrada' : 'Nueva Entrada'}
              </h3>
              
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Categoría
                    </label>
                    <select
                      value={editingEntry.category}
                      onChange={(e) => setEditingEntry({...editingEntry, category: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Seleccionar categoría...</option>
                      <option value="Productos">Productos</option>
                      <option value="Precios">Precios</option>
                      <option value="Políticas">Políticas</option>
                      <option value="Soporte">Soporte</option>
                      <option value="General">General</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Título
                    </label>
                    <input
                      type="text"
                      value={editingEntry.title}
                      onChange={(e) => setEditingEntry({...editingEntry, title: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Título de la entrada..."
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Contenido
                  </label>
                  <textarea
                    value={editingEntry.content}
                    onChange={(e) => setEditingEntry({...editingEntry, content: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                    rows={5}
                    placeholder="Contenido detallado de la entrada..."
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Palabras Clave (separadas por comas)
                  </label>
                  <input
                    type="text"
                    value={editingEntry.keywords}
                    onChange={(e) => setEditingEntry({...editingEntry, keywords: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="palabra1, palabra2, palabra3..."
                  />
                </div>
                
                <div className="flex items-center justify-between pt-4 border-t">
                  <button
                    onClick={() => setEditingEntry(null)}
                    className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  
                  <button className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                    <Save className="h-4 w-4 mr-2" />
                    {editingEntry.id ? 'Actualizar' : 'Crear'}
                  </button>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
