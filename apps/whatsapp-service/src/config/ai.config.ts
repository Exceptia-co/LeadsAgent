/**
 * Configuración centralizada de IA para LeadsCRM
 * 
 * Este archivo garantiza que SIEMPRE se use el modelo openai/gpt-oss-120b
 * sin importar otras configuraciones locales
 */

export const AI_CONFIG = {
  // Modelo fijo para OpenRouter - SIEMPRE openai/gpt-oss-120b
  OPENROUTER_MODEL: 'openai/gpt-oss-120b',
  
  // Base URL para OpenRouter
  OPENROUTER_BASE_URL: process.env['OPENROUTER_BASE_URL'] || 'https://openrouter.ai/api/v1',
  
  // API Key desde variables de entorno
  OPENROUTER_API_KEY: process.env['OPENROUTER_API_KEY'] || '',
  
  // Proveedor preferido
  DEFAULT_PROVIDER: 'openrouter' as const,
  
  // Configuración del modelo
  MODEL_SETTINGS: {
    maxTokens: 2048,
    temperature: 0.7,
    stream: false
  },
  
  // Headers adicionales para OpenRouter
  DEFAULT_HEADERS: {
    'HTTP-Referer': 'http://localhost:3002',
    'X-Title': 'LeadsCRM WhatsApp Service'
  }
} as const

/**
 * Obtiene el modelo que DEBE ser usado
 * Ignora variables de entorno y siempre devuelve openai/gpt-oss-120b
 */
export function getModelName(): string {
  return AI_CONFIG.OPENROUTER_MODEL
}

/**
 * Valida que la configuración sea correcta
 */
export function validateAIConfig(): { isValid: boolean; errors: string[] } {
  const errors: string[] = []
  
  if (!AI_CONFIG.OPENROUTER_API_KEY) {
    errors.push('OPENROUTER_API_KEY is not configured')
  }
  
  if (AI_CONFIG.OPENROUTER_MODEL !== 'openai/gpt-oss-120b') {
    errors.push(`Expected model 'openai/gpt-oss-120b' but got '${AI_CONFIG.OPENROUTER_MODEL}'`)
  }
  
  return {
    isValid: errors.length === 0,
    errors
  }
}

export type AIProvider = typeof AI_CONFIG.DEFAULT_PROVIDER
