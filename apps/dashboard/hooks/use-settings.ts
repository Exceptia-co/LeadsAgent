import { useState, useEffect, useCallback } from 'react'
import {
  SystemStatus,
  DatabaseStatus,
  ApiKeyConfig,
  WhatsAppSettings,
  NotificationSettings,
  MCPServerStatus,
  SystemMetrics,
  BackupSettings,
  GeneralSettings
} from '../types/settings'

const WHATSAPP_SERVICE_BASE_URL = 'http://localhost:3002'

export function useSettings() {
  // System status states
  const [systemServices, setSystemServices] = useState<SystemStatus[]>([])
  const [databaseStatus, setDatabaseStatus] = useState<DatabaseStatus | null>(null)
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(null)
  
  // Configuration states
  const [apiKeys, setApiKeys] = useState<ApiKeyConfig[]>([])
  const [whatsappSettings, setWhatsappSettings] = useState<WhatsAppSettings>({
    maxSessions: 5,
    autoReconnect: true,
    messageRetries: 3,
    rateLimitEnabled: true,
    rateLimitPerMinute: 30,
    qrTimeout: 60
  })
  const [notifications, setNotifications] = useState<NotificationSettings>({
    email: { enabled: false, events: [] },
    browser: { enabled: true, events: ['new_lead', 'message_received'] },
    webhook: { enabled: false, events: [] }
  })
  const [mcpServers, setMcpServers] = useState<MCPServerStatus[]>([])
  const [backupSettings, setBackupSettings] = useState<BackupSettings>({
    autoBackup: true,
    frequency: 'daily',
    retention: 30,
    includeMedia: true
  })
  const [generalSettings, setGeneralSettings] = useState<GeneralSettings>({
    theme: 'light',
    language: 'es',
    timezone: 'America/Mexico_City',
    dateFormat: 'DD/MM/YYYY',
    debugMode: false,
    analyticsEnabled: true
  })
  
  // Loading and error states
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Mock API key configurations
  const initializeApiKeys = useCallback(() => {
    const mockApiKeys: ApiKeyConfig[] = [
      {
        name: 'OpenRouter API',
        key: 'OPENROUTER_API_KEY_REMOVED',
        configured: true,
        provider: 'openrouter',
        description: 'API para múltiples modelos de IA',
        lastUsed: new Date().toISOString()
      },
      {
        name: 'Google Gemini API',
        key: 'GEMINI_API_KEY_REMOVED',
        configured: true,
        provider: 'gemini',
        description: 'API de Google Gemini Pro',
        lastUsed: new Date().toISOString()
      },
      {
        name: 'Supabase API',
        key: '',
        configured: false,
        provider: 'supabase',
        description: 'Base de datos y autenticación'
      },
      {
        name: 'Clerk API',
        key: '',
        configured: false,
        provider: 'clerk',
        description: 'Gestión de usuarios y autenticación'
      }
    ]
    setApiKeys(mockApiKeys)
  }, [])

  // Fetch system status
  const fetchSystemStatus = useCallback(async () => {
    try {
      setError(null)
      
      // Check WhatsApp service
      const whatsappService: SystemStatus = {
        service: 'WhatsApp Service',
        status: 'online',
        version: '1.0.0',
        lastCheck: new Date().toISOString(),
        details: 'Servicio de WhatsApp funcionando correctamente'
      }

      // Mock other services
      const services: SystemStatus[] = [
        whatsappService,
        {
          service: 'Dashboard',
          status: 'online',
          version: '1.0.0',
          lastCheck: new Date().toISOString(),
          details: 'Next.js 15.4.2'
        },
        {
          service: 'Base de Datos',
          status: 'online',
          version: 'PostgreSQL 15',
          lastCheck: new Date().toISOString(),
          details: 'Supabase + Prisma'
        }
      ]

      // Try to check WhatsApp service health
      try {
        const response = await fetch(`${WHATSAPP_SERVICE_BASE_URL}/health`)
        if (response.ok) {
          const data = await response.json()
          services[0].details = `Activo - Uptime: ${Math.floor(data.uptime / 3600)}h`
        }
      } catch (err) {
        services[0].status = 'offline'
        services[0].details = 'Servicio no disponible en puerto 3002'
      }

      setSystemServices(services)

      // Mock database status
      setDatabaseStatus({
        connected: true,
        host: 'localhost',
        database: 'leadcrm',
        tablesCount: 8,
        size: '15.2 MB',
        responseTime: 45,
        lastBackup: new Date().toISOString()
      })

      // Mock system metrics
      setSystemMetrics({
        memory: {
          used: 512,
          total: 8192,
          percentage: Math.round((512 / 8192) * 100)
        },
        cpu: {
          percentage: Math.floor(Math.random() * 30) + 10
        },
        storage: {
          used: 2500,
          total: 10000,
          percentage: 25
        },
        uptime: Date.now() - (24 * 60 * 60 * 1000) // 24 hours
      })

    } catch (err) {
      setError('Error fetching system status')
      console.error('Error fetching system status:', err)
    }
  }, [])

  // Initialize MCP servers status
  const initializeMcpServers = useCallback(() => {
    const servers: MCPServerStatus[] = [
      {
        name: 'Context7',
        type: 'context7',
        status: 'connected',
        version: '1.2.0',
        description: 'Documentación actualizada de librerías',
        lastActivity: new Date().toISOString()
      },
      {
        name: 'Perplexity Ask',
        type: 'perplexity',
        status: 'connected',
        version: '1.0.0',
        description: 'Búsqueda web en tiempo real',
        lastActivity: new Date().toISOString()
      },
      {
        name: 'Serena MCP',
        type: 'serena',
        status: 'disconnected',
        description: 'Toolkit de desarrollo con LSP'
      },
      {
        name: 'Sequential Thinking',
        type: 'sequential-thinking',
        status: 'connected',
        version: '1.1.0',
        description: 'Resolución estructurada de problemas',
        lastActivity: new Date().toISOString()
      }
    ]
    setMcpServers(servers)
  }, [])

  // Save settings
  const saveSettings = useCallback(async (section: string, data: any) => {
    setSaving(true)
    try {
      setError(null)
      
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // In a real app, you'd make an API call here
      console.log(`Saving ${section} settings:`, data)
      
      // Update local state based on section
      switch (section) {
        case 'whatsapp':
          setWhatsappSettings(data)
          break
        case 'notifications':
          setNotifications(data)
          break
        case 'backup':
          setBackupSettings(data)
          break
        case 'general':
          setGeneralSettings(data)
          break
        case 'api-keys':
          setApiKeys(data)
          break
      }
      
      return { success: true }
    } catch (err) {
      setError('Error saving settings')
      return { success: false, error: 'Failed to save settings' }
    } finally {
      setSaving(false)
    }
  }, [])

  // Create backup
  const createBackup = useCallback(async () => {
    try {
      setSaving(true)
      setError(null)
      
      // Simulate backup creation
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Update last backup time
      setBackupSettings(prev => ({
        ...prev,
        lastBackup: new Date().toISOString()
      }))
      
      return { success: true, filename: `backup-${Date.now()}.json` }
    } catch (err) {
      setError('Error creating backup')
      return { success: false }
    } finally {
      setSaving(false)
    }
  }, [])

  // Test connection
  const testConnection = useCallback(async (service: string) => {
    try {
      setError(null)
      
      switch (service) {
        case 'whatsapp':
          const response = await fetch(`${WHATSAPP_SERVICE_BASE_URL}/health`)
          return { success: response.ok }
        case 'database':
          // Simulate database test
          await new Promise(resolve => setTimeout(resolve, 500))
          return { success: true }
        default:
          return { success: false, error: 'Unknown service' }
      }
    } catch (err) {
      return { success: false, error: 'Connection failed' }
    }
  }, [])

  // Initialize all data
  useEffect(() => {
    const initialize = async () => {
      setIsLoading(true)
      try {
        initializeApiKeys()
        await fetchSystemStatus()
        initializeMcpServers()
      } catch (err) {
        setError('Error initializing settings')
      } finally {
        setIsLoading(false)
      }
    }

    initialize()
  }, [initializeApiKeys, fetchSystemStatus, initializeMcpServers])

  // Auto-refresh system status every 2 minutes
  useEffect(() => {
    const interval = setInterval(fetchSystemStatus, 120000)
    return () => clearInterval(interval)
  }, [fetchSystemStatus])

  return {
    // Data
    systemServices,
    databaseStatus,
    systemMetrics,
    apiKeys,
    whatsappSettings,
    notifications,
    mcpServers,
    backupSettings,
    generalSettings,
    
    // States
    isLoading,
    error,
    saving,
    
    // Actions
    saveSettings,
    createBackup,
    testConnection,
    fetchSystemStatus
  }
}
