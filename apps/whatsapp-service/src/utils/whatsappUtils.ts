import { logger } from './logger';

/**
 * Utilidades compartidas para servicios de WhatsApp
 * Extrae funcionalidades comunes para evitar duplicación de código
 */
export class WhatsAppUtils {
  
  /**
   * Normalizar teléfono para uso consistente en cache
   * @param telefono - Número de teléfono a normalizar
   * @returns Número normalizado para cache
   */
  public static normalizePhoneForCache(telefono: string): string {
    if (!telefono) return '';
    
    // Remover caracteres no numéricos y '1' inicial
    return telefono.replace(/[^0-9]/g, '').replace(/^1/, '');
  }

  /**
   * Formatear número de teléfono para WhatsApp Web
   * @param phoneNumber - Número de teléfono
   * @returns Número formateado con @c.us si es necesario
   */
  public static formatPhoneForWhatsApp(phoneNumber: string): string {
    if (!phoneNumber) {
      throw new Error("Phone number is required");
    }

    // Remove WhatsApp suffix if present
    let normalized = phoneNumber.replace(/@c\.us$/, "").replace(/@g\.us$/, "");

    // Remove '+' prefix that causes issues with WhatsApp Web
    normalized = normalized.replace(/^\+/, "");

    // Remove any spaces, dashes, or parentheses
    normalized = normalized.replace(/[\s\-\(\)]/g, "");

    // Ensure it's only digits
    normalized = normalized.replace(/[^\d]/g, "");

    // Validate the result
    if (!normalized || normalized.length < 8 || normalized.length > 15) {
      throw new Error(
        `Invalid phone number format: ${phoneNumber}. Expected 8-15 digits.`
      );
    }

    // Add WhatsApp suffix if not present
    return normalized.includes("@c.us") ? normalized : `${normalized}@c.us`;
  }

  /**
   * Extraer número de teléfono limpio desde formato de WhatsApp
   * @param phoneWithSuffix - Número con sufijo de WhatsApp (@c.us)
   * @returns Número limpio sin sufijos
   */
  public static cleanPhoneNumber(phoneWithSuffix: string): string {
    return phoneWithSuffix
      .replace("@c.us", "")
      .replace("@g.us", "");
  }

  /**
   * Validar formato de número de teléfono
   * @param phoneNumber - Número a validar
   * @returns true si es válido, false en caso contrario
   */
  public static isValidPhoneNumber(phoneNumber: string): boolean {
    if (!phoneNumber) return false;
    
    const cleaned = phoneNumber.replace(/[^\d]/g, "");
    return cleaned.length >= 8 && cleaned.length <= 15;
  }

  /**
   * Generar ID único para sesiones
   * @param prefix - Prefijo opcional
   * @returns ID único
   */
  public static generateSessionId(prefix: string = 'session'): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2);
    return `${prefix}_${timestamp}_${random}`;
  }

  /**
   * Calcular delay humanizado para respuestas
   * @param messageLength - Longitud del mensaje
   * @param complexity - Factor de complejidad
   * @returns Delay en milisegundos
   */
  public static calculateHumanizedDelay(
    messageLength: number, 
    complexity: number = 1.0
  ): number {
    const minDelay = parseInt(process.env.AI_RESPONSE_DELAY_MIN || "2000");
    const maxDelay = parseInt(process.env.AI_RESPONSE_DELAY_MAX || "6000");

    // Calculate delay based on message length
    const baseDelay = Math.min(messageLength * 50, 2000);
    const randomDelay = Math.random() * (maxDelay - minDelay) + minDelay;
    const totalDelay = Math.min((randomDelay + baseDelay) * complexity, maxDelay);

    return Math.max(minDelay, totalDelay);
  }

  /**
   * Crear timestamp ISO string
   * @returns Timestamp actual en formato ISO
   */
  public static getTimestamp(): string {
    return new Date().toISOString();
  }

  /**
   * Validar si una sesión está lista para enviar mensajes
   * @param session - Objeto de sesión de WhatsApp
   * @returns true si está lista, false en caso contrario
   */
  public static isSessionReady(session: any): boolean {
    return session && (session.status === 'ready' || session.status === 'authenticated');
  }

  /**
   * Extraer información básica del cliente de WhatsApp
   * @param clientInfo - Información del cliente
   * @returns Información básica normalizada
   */
  public static extractBasicClientInfo(clientInfo: any): {
    number?: string;
    pushname?: string;
    platform?: string;
  } {
    return {
      number: clientInfo?.wid?.user || 'unknown',
      pushname: clientInfo?.pushname || 'unknown',
      platform: clientInfo?.platform || 'unknown',
    };
  }
}

/**
 * Utilidades específicas para Redis/Cache
 */
export class RedisUtils {
  
  /**
   * Verificar conexión a Redis de manera segura
   * @param redisClient - Cliente de Redis
   * @returns true si está conectado, false en caso contrario
   */
  public static async checkConnection(redisClient: any): Promise<boolean> {
    try {
      const result = await redisClient.ping();
      return !!result;
    } catch (error) {
      logger.warn('Redis connection check failed:', error);
      return false;
    }
  }

  /**
   * Publicar evento de manera segura
   * @param redisClient - Cliente de Redis
   * @param channel - Canal de Redis
   * @param data - Datos a publicar
   */
  public static async safePublish(
    redisClient: any, 
    channel: string, 
    data: Record<string, any>
  ): Promise<void> {
    try {
      await redisClient.publishObject(channel, data);
      logger.debug(`📡 Event published to ${channel}`);
    } catch (error) {
      logger.warn(`Failed to publish to Redis channel ${channel}:`, error);
      // No lanzar error para no interrumpir funcionalidad principal
    }
  }

  /**
   * Generar clave de cache estándar
   * @param prefix - Prefijo de la clave
   * @param identifier - Identificador único
   * @returns Clave de cache formateada
   */
  public static generateCacheKey(prefix: string, identifier: string): string {
    return `${prefix}:${identifier}`;
  }
}
