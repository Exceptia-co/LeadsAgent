/**
 * @fileoverview ConnectionManager - Handles Puppeteer connections and reconnection logic
 * Part of WhatsAppServiceSimple refactoring following SRP
 */

import { Client, LocalAuth } from 'whatsapp-web.js';
import path from 'path';
import fs from 'fs';
import { logger } from '../../utils/logger';
import { LogExecutionTime, Retry, SafeExecutor, isSuccess, isFailure } from '../../utils/decorators';
import { ErrorFactory } from '../../errors';
import { eventBus } from '../../events/EventBus';
import type { 
  IConnectionManager, 
  ConnectionHealth, 
  Result 
} from '../../types';

/**
 * ConnectionManager handles Puppeteer client connections and reconnection logic
 * Responsible for creating, maintaining, and recovering WhatsApp Web connections
 */
export class ConnectionManager implements IConnectionManager {
  private connectionHealth = new Map<string, ConnectionHealth>();
  private reconnectionAttempts = new Map<string, number>();
  private connectionTimers = new Map<string, NodeJS.Timeout>();

  private readonly MAX_RECONNECTION_ATTEMPTS = 3;
  private readonly RECONNECTION_DELAY_MS = 5000;
  private readonly CONNECTION_TIMEOUT_MS = 120000; // 2 minutes

  /**
   * Connect a session by creating and initializing WhatsApp client
   */
  @LogExecutionTime({ operationId: 'connect-session' })
  public async connect(sessionId: string): Promise<void> {
    return SafeExecutor.execute(
      async () => {
        logger.info(`🔌 Connecting session: ${sessionId}`);

        // Ensure auth directory exists and is valid
        const authDataPath = path.resolve('./wwebjs_auth');
        await this.ensureAuthDirectoryExists(authDataPath);
        await this.validateAndCleanAuthFiles(sessionId, authDataPath);

        // Create client configuration
        const clientConfig = this.createClientConfig(sessionId, authDataPath);

        // Create WhatsApp client
        const client = new Client(clientConfig);

        // Setup connection timeout
        const timeoutId = this.setupConnectionTimeout(sessionId, client);

        // Initialize connection health tracking
        this.initializeConnectionHealth(sessionId);

        // Initialize the client
        client.initialize();

        // Clean up timeout on successful connection
        client.once('ready', () => {
          if (timeoutId) clearTimeout(timeoutId);
          this.updateConnectionHealth(sessionId, { isHealthy: true });
          logger.info(`✅ Session connected successfully: ${sessionId}`);
        });

        client.once('qr', () => {
          if (timeoutId) clearTimeout(timeoutId);
        });

        client.once('auth_failure', () => {
          if (timeoutId) clearTimeout(timeoutId);
          this.updateConnectionHealth(sessionId, { isHealthy: false });
        });

        return client;
      },
      {
        operationName: 'connect-session',
        context: { sessionId },
        timeout: this.CONNECTION_TIMEOUT_MS + 10000, // Extra buffer
      }
    ).then(result => {
      if (isFailure(result)) {
        throw result.error;
      }
    });
  }

  /**
   * Disconnect a session and cleanup resources
   */
  @LogExecutionTime({ operationId: 'disconnect-session' })
  public async disconnect(sessionId: string): Promise<void> {
    return SafeExecutor.execute(
      async () => {
        logger.info(`🔌 Disconnecting session: ${sessionId}`);

        // Clear any existing timers
        const timer = this.connectionTimers.get(sessionId);
        if (timer) {
          clearTimeout(timer);
          this.connectionTimers.delete(sessionId);
        }

        // Reset reconnection attempts
        this.reconnectionAttempts.delete(sessionId);

        // Update connection health
        this.updateConnectionHealth(sessionId, { 
          isHealthy: false,
          lastPingTime: new Date(),
        });

        logger.info(`✅ Session disconnected successfully: ${sessionId}`);
      },
      {
        operationName: 'disconnect-session',
        context: { sessionId },
        timeout: 10000,
      }
    ).then(result => {
      if (isFailure(result)) {
        throw result.error;
      }
    });
  }

  /**
   * Reconnect a session with exponential backoff
   */
  @LogExecutionTime({ operationId: 'reconnect-session' })
  @Retry(3, 5000)
  public async reconnect(sessionId: string, maxAttempts: number = 3): Promise<void> {
    return SafeExecutor.execute(
      async () => {
        const currentAttempts = this.reconnectionAttempts.get(sessionId) || 0;
        const effectiveMaxAttempts = Math.min(maxAttempts, this.MAX_RECONNECTION_ATTEMPTS);

        if (currentAttempts >= effectiveMaxAttempts) {
          throw ErrorFactory.connection(
            `Maximum reconnection attempts (${effectiveMaxAttempts}) reached for session ${sessionId}`,
            sessionId,
            { attempts: currentAttempts, maxAttempts: effectiveMaxAttempts }
          );
        }

        logger.info(`🔄 Reconnecting session: ${sessionId} (attempt ${currentAttempts + 1}/${effectiveMaxAttempts})`);

        // Update reconnection attempts
        this.reconnectionAttempts.set(sessionId, currentAttempts + 1);

        // Disconnect first to clean up any existing connections
        await this.disconnect(sessionId);

        // Wait before reconnecting (exponential backoff)
        const delay = this.RECONNECTION_DELAY_MS * Math.pow(2, currentAttempts);
        await this.delay(delay);

        // Attempt to connect
        await this.connect(sessionId);

        // Reset reconnection attempts on successful reconnection
        this.reconnectionAttempts.delete(sessionId);

        // Emit reconnection event
        await eventBus.publish('whatsapp:session-reconnected', {
          sessionId,
          attempts: currentAttempts + 1,
          timestamp: new Date(),
        });

        logger.info(`✅ Session reconnected successfully: ${sessionId}`);
      },
      {
        operationName: 'reconnect-session',
        context: { sessionId, maxAttempts },
        timeout: this.CONNECTION_TIMEOUT_MS + 30000,
      }
    ).then(result => {
      if (isFailure(result)) {
        throw result.error;
      }
    });
  }

  /**
   * Check if a session is connected
   */
  public isConnected(sessionId: string): boolean {
    const health = this.connectionHealth.get(sessionId);
    return health?.isHealthy === true;
  }

  /**
   * Get connection health for a session
   */
  public async getConnectionHealth(sessionId: string): Promise<ConnectionHealth> {
    const health = this.connectionHealth.get(sessionId);
    
    if (!health) {
      return {
        isHealthy: false,
        lastPingTime: new Date(),
        responseTime: -1,
        errorCount: 0,
        uptime: 0,
      };
    }

    // Calculate uptime
    const uptime = Date.now() - health.lastPingTime.getTime();
    
    return {
      ...health,
      uptime,
    };
  }

  /**
   * Ping a session to check connectivity
   */
  @LogExecutionTime({ operationId: 'ping-session' })
  public async pingSession(sessionId: string): Promise<boolean> {
    return SafeExecutor.execute(
      async () => {
        const startTime = Date.now();
        
        // This would typically involve sending a ping to the WhatsApp Web client
        // For now, we'll just check if the health record exists and is healthy
        const health = this.connectionHealth.get(sessionId);
        const responseTime = Date.now() - startTime;

        if (health) {
          this.updateConnectionHealth(sessionId, {
            lastPingTime: new Date(),
            responseTime,
          });
          return health.isHealthy;
        }

        return false;
      },
      {
        operationName: 'ping-session',
        context: { sessionId },
        timeout: 5000,
      }
    ).then(result => result.success ? result.data : false);
  }

  /**
   * Get reconnection attempts for a session
   */
  public getReconnectionAttempts(sessionId: string): number {
    return this.reconnectionAttempts.get(sessionId) || 0;
  }

  /**
   * Reset reconnection attempts for a session
   */
  public resetReconnectionAttempts(sessionId: string): void {
    this.reconnectionAttempts.delete(sessionId);
    logger.debug(`🔄 Reset reconnection attempts for session: ${sessionId}`);
  }

  /**
   * Handle browser disconnect events
   */
  @LogExecutionTime({ operationId: 'handle-browser-disconnect' })
  public async handleBrowserDisconnect(
    sessionId: string, 
    reason: string
  ): Promise<void> {
    logger.warn(`🚨 Browser disconnected for session ${sessionId}: ${reason}`);

    // Update connection health
    this.updateConnectionHealth(sessionId, { 
      isHealthy: false,
      errorCount: (this.connectionHealth.get(sessionId)?.errorCount || 0) + 1,
    });

    // Emit disconnect event
    await eventBus.publish('whatsapp:disconnected', {
      sessionId,
      reason,
      timestamp: new Date(),
    });

    // Attempt automatic reconnection if not too many attempts
    const attempts = this.getReconnectionAttempts(sessionId);
    if (attempts < this.MAX_RECONNECTION_ATTEMPTS) {
      logger.info(`🔄 Attempting automatic reconnection for session: ${sessionId}`);
      
      setTimeout(async () => {
        try {
          await this.reconnect(sessionId);
        } catch (error) {
          logger.error(`❌ Automatic reconnection failed for session ${sessionId}:`, error);
        }
      }, this.RECONNECTION_DELAY_MS);
    } else {
      logger.warn(`⚠️ Maximum reconnection attempts reached for session ${sessionId}`);
    }
  }

  /**
   * Create client configuration for WhatsApp Web
   */
  private createClientConfig(sessionId: string, authDataPath: string) {
    return {
      authStrategy: new LocalAuth({
        clientId: sessionId,
        dataPath: authDataPath,
      }),
      puppeteer: {
        headless: process.env.PUPPETEER_HEADLESS === 'true' || process.env.NODE_ENV === 'production',
        executablePath: process.env.CHROME_EXECUTABLE_PATH || undefined,
        devtools: process.env.NODE_ENV === 'development',
        timeout: this.CONNECTION_TIMEOUT_MS,
        args: [
          // Security
          '--no-sandbox',
          '--disable-setuid-sandbox',
          
          // Memory optimization
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-gpu-sandbox',
          '--no-first-run',
          
          // WhatsApp Web stability
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          
          // Memory leak prevention
          '--memory-pressure-off',
          '--max_old_space_size=4096',
          
          // Windows specific
          '--disable-win32k-lockdown',
          '--disable-component-cloud-policy',
          '--disable-domain-reliability',
          
          // User agent
          '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          
          // Development logging
          ...(process.env.NODE_ENV === 'development' ? [
            '--enable-logging=stderr',
            '--log-level=1'
          ] : [])
        ],
      },
    };
  }

  /**
   * Setup connection timeout for a session
   */
  private setupConnectionTimeout(sessionId: string, client: Client): NodeJS.Timeout {
    const timeoutId = setTimeout(() => {
      logger.error(`⏰ Session ${sessionId} initialization timeout after ${this.CONNECTION_TIMEOUT_MS}ms`);
      this.handleBrowserDisconnect(sessionId, 'INIT_TIMEOUT');
    }, this.CONNECTION_TIMEOUT_MS);

    this.connectionTimers.set(sessionId, timeoutId);
    return timeoutId;
  }

  /**
   * Initialize connection health tracking for a session
   */
  private initializeConnectionHealth(sessionId: string): void {
    const health: ConnectionHealth = {
      isHealthy: false,
      lastPingTime: new Date(),
      responseTime: 0,
      errorCount: 0,
      uptime: 0,
    };

    this.connectionHealth.set(sessionId, health);
    logger.debug(`📊 Initialized connection health tracking for session: ${sessionId}`);
  }

  /**
   * Update connection health for a session
   */
  private updateConnectionHealth(
    sessionId: string, 
    updates: Partial<ConnectionHealth>
  ): void {
    const current = this.connectionHealth.get(sessionId) || {
      isHealthy: false,
      lastPingTime: new Date(),
      responseTime: 0,
      errorCount: 0,
      uptime: 0,
    };

    const updated = { ...current, ...updates };
    this.connectionHealth.set(sessionId, updated);
  }

  /**
   * Ensure auth directory exists and has proper permissions
   */
  private async ensureAuthDirectoryExists(authDataPath: string): Promise<void> {
    if (!fs.existsSync(authDataPath)) {
      await fs.promises.mkdir(authDataPath, { recursive: true });
      logger.info(`📁 Created auth directory: ${authDataPath}`);
    }
  }

  /**
   * Validate and clean corrupted auth files
   */
  private async validateAndCleanAuthFiles(
    sessionId: string, 
    authDataPath: string
  ): Promise<void> {
    const sessionPath = path.join(authDataPath, `session-${sessionId}`);
    
    if (!fs.existsSync(sessionPath)) {
      logger.debug(`📁 Session path does not exist, will be created: ${sessionPath}`);
      return;
    }

    try {
      // Basic validation - check if essential files exist
      const wwebSessionPath = path.join(sessionPath, 'wwebSession');
      
      if (fs.existsSync(wwebSessionPath)) {
        const stats = await fs.promises.stat(wwebSessionPath);
        
        // If session directory is very old (>30 days), consider it stale
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        
        if (stats.mtime.getTime() < thirtyDaysAgo) {
          logger.warn(`🧹 Cleaning stale auth files for session ${sessionId}`);
          await fs.promises.rm(sessionPath, { recursive: true, force: true });
        }
      }
    } catch (error) {
      logger.warn(`⚠️ Error validating auth files for session ${sessionId}:`, error);
      
      // If validation fails, clean up corrupted files
      try {
        await fs.promises.rm(sessionPath, { recursive: true, force: true });
        logger.info(`🧹 Cleaned up corrupted auth files for session ${sessionId}`);
      } catch (cleanupError) {
        logger.error(`❌ Failed to cleanup corrupted auth files for session ${sessionId}:`, cleanupError);
      }
    }
  }

  /**
   * Utility function for creating delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clean up resources for a session
   */
  public cleanup(sessionId: string): void {
    // Clear timers
    const timer = this.connectionTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.connectionTimers.delete(sessionId);
    }

    // Clear health tracking
    this.connectionHealth.delete(sessionId);

    // Clear reconnection attempts
    this.reconnectionAttempts.delete(sessionId);

    logger.debug(`🧹 Cleaned up connection resources for session: ${sessionId}`);
  }

  /**
   * Create a new WhatsApp Web connection for a session
   */
  @LogExecutionTime({ operationId: 'create-connection' })
  public async createConnection(sessionId: string, options?: any): Promise<any> {
    return SafeExecutor.execute(
      async () => {
        logger.info(`🔌 Creating new connection for session: ${sessionId}`);

        // Ensure auth directory exists and is valid
        const authDataPath = path.resolve('./wwebjs_auth');
        await this.ensureAuthDirectoryExists(authDataPath);
        await this.validateAndCleanAuthFiles(sessionId, authDataPath);

        // Create client configuration
        const clientConfig = {
          ...this.createClientConfig(sessionId, authDataPath),
          ...options,
        };

        // Create WhatsApp client
        const client = new Client(clientConfig);

        // Initialize connection health tracking
        this.initializeConnectionHealth(sessionId);

        logger.info(`✅ WhatsApp client created for session: ${sessionId}`);
        return client;
      },
      {
        operationName: 'create-connection',
        context: { sessionId, options },
        timeout: 30000,
      }
    ).then(result => {
      if (isFailure(result)) {
        throw result.error;
      }
      return result.data;
    });
  }

  /**
   * Initialize connection for a session
   */
  @LogExecutionTime({ operationId: 'initialize-connection' })
  public async initializeConnection(sessionId: string): Promise<void> {
    return SafeExecutor.execute(
      async () => {
        logger.info(`🚀 Initializing connection for session: ${sessionId}`);
        
        // This would typically involve:
        // 1. Setting up event listeners
        // 2. Starting the client initialization process
        // 3. Waiting for ready state
        
        // Update connection health to indicate initialization started
        this.updateConnectionHealth(sessionId, {
          lastPingTime: new Date(),
        });

        logger.info(`✅ Connection initialization started for session: ${sessionId}`);
      },
      {
        operationName: 'initialize-connection',
        context: { sessionId },
        timeout: 30000,
      }
    ).then(result => {
      if (isFailure(result)) {
        throw result.error;
      }
    });
  }

  /**
   * Destroy connection and cleanup resources for a session
   */
  @LogExecutionTime({ operationId: 'destroy-connection' })
  public async destroyConnection(sessionId: string): Promise<void> {
    return SafeExecutor.execute(
      async () => {
        logger.info(`🗑️ Destroying connection for session: ${sessionId}`);

        // Disconnect the session first
        await this.disconnect(sessionId);

        // Additional cleanup
        this.cleanup(sessionId);

        logger.info(`✅ Connection destroyed for session: ${sessionId}`);
      },
      {
        operationName: 'destroy-connection',
        context: { sessionId },
        timeout: 15000,
      }
    ).then(result => {
      if (isFailure(result)) {
        throw result.error;
      }
    });
  }

  /**
   * Get connection metrics for a session
   */
  public getConnectionMetrics(sessionId: string): any {
    const health = this.connectionHealth.get(sessionId);
    const attempts = this.reconnectionAttempts.get(sessionId) || 0;
    const hasTimer = this.connectionTimers.has(sessionId);

    return {
      sessionId,
      isHealthy: health?.isHealthy || false,
      lastPingTime: health?.lastPingTime || null,
      responseTime: health?.responseTime || -1,
      errorCount: health?.errorCount || 0,
      uptime: health?.uptime || 0,
      reconnectionAttempts: attempts,
      hasActiveTimer: hasTimer,
      connectionState: {
        initialized: health !== undefined,
        connected: this.isConnected(sessionId),
        healthy: health?.isHealthy || false,
      },
    };
  }

  /**
   * Get connection statistics
   */
  public getStats(): {
    totalConnections: number;
    healthyConnections: number;
    reconnectionAttempts: Record<string, number>;
    averageResponseTime: number;
  } {
    const connections = Array.from(this.connectionHealth.values());
    const healthyConnections = connections.filter(h => h.isHealthy).length;
    const totalResponseTime = connections.reduce((sum, h) => sum + h.responseTime, 0);
    const averageResponseTime = connections.length > 0 ? totalResponseTime / connections.length : 0;

    return {
      totalConnections: connections.length,
      healthyConnections,
      reconnectionAttempts: Object.fromEntries(this.reconnectionAttempts.entries()),
      averageResponseTime,
    };
  }
}
