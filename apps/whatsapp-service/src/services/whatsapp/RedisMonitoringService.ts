import { logger } from "../../utils/logger";
import { RedisUtils } from "../../utils/whatsappUtils";

// Tipo para el cliente Redis personalizado del proyecto
type RedisClientType = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl?: number): Promise<void>;
  del(key: string): Promise<void>;
  ping(): Promise<boolean>;
  info(): Promise<string>;
};

/**
 * Servicio centralizado para monitoreo de Redis
 * Evita duplicación de código de monitoreo en servicios múltiples
 */
export class RedisMonitoringService {
  private redisClient?: RedisClientType;
  private monitoringInterval?: NodeJS.Timeout;
  private isMonitoring = false;
  private readonly checkIntervalMs: number;

  constructor(redisClient?: RedisClientType, checkIntervalMs: number = 30000) {
    this.redisClient = redisClient;
    this.checkIntervalMs = checkIntervalMs;
  }

  /**
   * Iniciar monitoreo de Redis
   */
  public startMonitoring(): void {
    if (this.isMonitoring || !this.redisClient) {
      return;
    }

    this.isMonitoring = true;
    logger.info(`🔍 Starting Redis monitoring (interval: ${this.checkIntervalMs}ms)`);

    this.monitoringInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, this.checkIntervalMs);

    // Realizar check inicial
    this.performHealthCheck();
  }

  /**
   * Detener monitoreo de Redis
   */
  public stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

    logger.info('🔍 Redis monitoring stopped');
  }

  /**
   * Verificar si el monitoreo está activo
   */
  public isMonitoringActive(): boolean {
    return this.isMonitoring;
  }

  /**
   * Realizar verificación de salud de Redis
   */
  private async performHealthCheck(): Promise<void> {
    if (!this.redisClient) {
      return;
    }

    try {
      const isConnected = await RedisUtils.checkConnection(this.redisClient);
      
      if (isConnected) {
        logger.debug('✅ Redis connection healthy');
        await this.recordHealthCheck(true);
      } else {
        logger.warn('❌ Redis connection unhealthy');
        await this.recordHealthCheck(false);
      }
    } catch (error) {
      logger.error('🔍 Redis health check failed:', error);
      await this.recordHealthCheck(false);
    }
  }

  /**
   * Registrar resultado de verificación de salud
   */
  private async recordHealthCheck(isHealthy: boolean): Promise<void> {
    if (!this.redisClient) return;

    try {
      const timestamp = new Date().toISOString();
      const healthData = {
        isHealthy,
        timestamp,
        checkInterval: this.checkIntervalMs,
      };

      const key = RedisUtils.generateCacheKey('whatsapp:health', 'redis_status');
      await this.redisClient.set(key, JSON.stringify(healthData), 300); // Expira en 5 minutos
    } catch (error) {
      // No loggear error aquí para evitar spam, ya que el check ya falló
      logger.debug('Failed to record health check result:', error);
    }
  }

  /**
   * Obtener último estado de salud de Redis
   */
  public async getLastHealthStatus(): Promise<{
    isHealthy: boolean;
    timestamp: string;
    checkInterval: number;
  } | null> {
    if (!this.redisClient) return null;

    try {
      const key = RedisUtils.generateCacheKey('whatsapp:health', 'redis_status');
      const data = await this.redisClient.get(key);
      
      if (data) {
        return JSON.parse(data);
      }
    } catch (error) {
      logger.warn('Failed to get last health status:', error);
    }

    return null;
  }

  /**
   * Obtener información de conexión de Redis
   */
  public async getRedisInfo(): Promise<Record<string, string> | null> {
    if (!this.redisClient) return null;

    try {
      const isConnected = await RedisUtils.checkConnection(this.redisClient);
      if (!isConnected) {
        return null;
      }

      const info = await this.redisClient.info();
      const infoLines = info.split('\r\n');
      const infoObject: Record<string, string> = {};

      infoLines.forEach(line => {
        if (line.includes(':') && !line.startsWith('#')) {
          const [key, value] = line.split(':');
          infoObject[key.trim()] = value.trim();
        }
      });

      return infoObject;
    } catch (error) {
      logger.warn('Failed to get Redis info:', error);
      return null;
    }
  }

  /**
   * Verificar memoria disponible en Redis
   */
  public async checkRedisMemory(): Promise<{
    usedMemory: string;
    maxMemory: string;
    memoryUsagePercentage?: number;
  } | null> {
    const info = await this.getRedisInfo();
    if (!info) return null;

    const usedMemory = info.used_memory_human || 'unknown';
    const maxMemory = info.maxmemory_human || 'unlimited';
    
    let memoryUsagePercentage: number | undefined;
    if (info.used_memory && info.maxmemory && info.maxmemory !== '0') {
      const used = parseInt(info.used_memory);
      const max = parseInt(info.maxmemory);
      memoryUsagePercentage = Math.round((used / max) * 100);
    }

    return {
      usedMemory,
      maxMemory,
      memoryUsagePercentage,
    };
  }

  /**
   * Cleanup al destruir el servicio
   */
  public destroy(): void {
    this.stopMonitoring();
  }
}
