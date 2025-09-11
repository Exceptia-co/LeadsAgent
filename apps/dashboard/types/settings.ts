// Types for Settings page functionality

export interface SystemStatus {
  service: string
  status: 'online' | 'offline' | 'error'
  version?: string
  lastCheck: string
  details?: string
}

export interface DatabaseStatus {
  connected: boolean
  host: string
  database: string
  tablesCount: number
  lastBackup?: string
  size?: string
  responseTime?: number
}

export interface ApiKeyConfig {
  name: string
  key: string
  configured: boolean
  lastUsed?: string
  provider: 'openrouter' | 'gemini' | 'openai' | 'supabase' | 'clerk'
  description: string
}

export interface WhatsAppSettings {
  maxSessions: number
  autoReconnect: boolean
  messageRetries: number
  rateLimitEnabled: boolean
  rateLimitPerMinute: number
  qrTimeout: number
}

export interface NotificationSettings {
  email: {
    enabled: boolean
    address?: string
    events: string[]
  }
  browser: {
    enabled: boolean
    events: string[]
  }
  webhook: {
    enabled: boolean
    url?: string
    events: string[]
  }
}

export interface MCPServerStatus {
  name: string
  type: 'context7' | 'perplexity' | 'serena' | 'sequential-thinking'
  status: 'connected' | 'disconnected' | 'error'
  version?: string
  description: string
  lastActivity?: string
}

export interface SystemMetrics {
  memory: {
    used: number
    total: number
    percentage: number
  }
  cpu: {
    percentage: number
  }
  storage: {
    used: number
    total: number
    percentage: number
  }
  uptime: number
}

export interface BackupSettings {
  autoBackup: boolean
  frequency: 'daily' | 'weekly' | 'monthly'
  retention: number
  includeMedia: boolean
  lastBackup?: string
  nextScheduled?: string
}

export interface GeneralSettings {
  theme: 'light' | 'dark' | 'auto'
  language: 'es' | 'en'
  timezone: string
  dateFormat: string
  debugMode: boolean
  analyticsEnabled: boolean
}

export type SettingsSection = 
  | 'general'
  | 'api-keys'
  | 'whatsapp'
  | 'database'
  | 'notifications'
  | 'mcp'
  | 'system'
  | 'backup'
