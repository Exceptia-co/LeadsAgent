/**
 * Configuración centralizada de IA para LeadsCRM
 *
 * El modelo de OpenRouter se configura via OPENROUTER_MODEL en .env
 * con fallback a 'openai/gpt-oss-120b'
 */

const DEFAULT_MODEL = 'openai/gpt-oss-120b';

export const AI_CONFIG = {
  // Modelo para OpenRouter - configurable via OPENROUTER_MODEL env var
  OPENROUTER_MODEL: process.env['OPENROUTER_MODEL'] || DEFAULT_MODEL,

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
    stream: false,
  },

  // Headers adicionales para OpenRouter
  DEFAULT_HEADERS: {
    'HTTP-Referer': 'http://localhost:3002',
    'X-Title': 'LeadsCRM WhatsApp Service',
  },
} as const;

/**
 * Obtiene el modelo configurado para OpenRouter
 */
export function getModelName(): string {
  return AI_CONFIG.OPENROUTER_MODEL;
}

/**
 * Valida que la configuración sea correcta
 */
export function validateAIConfig(): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!AI_CONFIG.OPENROUTER_API_KEY) {
    errors.push('OPENROUTER_API_KEY is not configured');
  }

  if (!AI_CONFIG.OPENROUTER_MODEL) {
    errors.push('OPENROUTER_MODEL is not configured');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export type AIProvider = typeof AI_CONFIG.DEFAULT_PROVIDER;
