import { Client, LocalAuth } from 'whatsapp-web.js';
import { logger } from '../../utils/logger';
import path from 'path';

/**
 * ConnectionManager - Handles WhatsApp client creation, browser management, and connection monitoring
 *
 * Responsibilities:
 * - WhatsApp Client creation with LocalAuth
 * - Puppeteer browser configuration and management
 * - Memory and heartbeat monitoring
 * - Browser disconnect detection and handling
 * - Connection health checks and recovery
 *
 * Extracted from WhatsAppServiceSimple lines: 100-149, 192-226, 235-298, 1981-2224
 */
export class ConnectionManager {
  private monitoringIntervals: Map<string, NodeJS.Timeout> = new Map();
  private lastMemoryLog: number = 0;

  /**
   * Create a WhatsApp client with LocalAuth and enhanced monitoring
   */
  async createClient(sessionId: string, authDataPath: string = './wwebjs_auth'): Promise<Client> {
    try {
      // Create WhatsApp client with session authentication
      const client = new Client({
        authStrategy: new LocalAuth({
          clientId: sessionId,
          dataPath: authDataPath,
        }),
        puppeteer: {
          headless:
            process.env.PUPPETEER_HEADLESS === 'true' || process.env.NODE_ENV === 'production',
          executablePath: process.env.CHROME_EXECUTABLE_PATH || undefined,
          devtools: process.env.NODE_ENV === 'development',
          // Enhanced configuration for stability
          timeout: 120000, // 2 minutes timeout for initialization
          args: [
            // Basic security (required)
            '--no-sandbox',
            '--disable-setuid-sandbox',

            // Memory optimization (common issues)
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

            // User configuration
            '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',

            // Enhanced logging for debugging
            ...(process.env.NODE_ENV === 'development'
              ? ['--enable-logging=stderr', '--log-level=1']
              : []),
          ],
        },
      });

      logger.info(`🚀 WhatsApp client created for session ${sessionId}`);
      return client;
    } catch (error) {
      logger.error(`Error creating WhatsApp client for session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Initialize client with enhanced monitoring and error handling
   */
  async initializeClient(
    client: Client,
    sessionId: string,
    onBrowserDisconnect: (sessionId: string, disconnectType: string) => Promise<void>
  ): Promise<void> {
    try {
      logger.info(`🚀 Initializing WhatsApp client for session ${sessionId}...`);

      // Add initialization timeout and error handling
      const initTimeout = setTimeout(() => {
        logger.error(`⏰ Session ${sessionId} initialization timeout after 2 minutes`);
        onBrowserDisconnect(sessionId, 'INIT_TIMEOUT');
      }, 120000); // 2 minutes timeout

      // Set up browser monitoring before initialization
      this.setupBrowserMonitoring(client, sessionId, onBrowserDisconnect);

      try {
        client.initialize();

        // Clear timeout once initialization starts
        client.once('qr', () => {
          clearTimeout(initTimeout);
          logger.info(`✅ Session ${sessionId} initialization successful - QR generated`);
        });

        client.once('ready', () => {
          clearTimeout(initTimeout);
          logger.info(`✅ Session ${sessionId} fully ready`);
        });

        client.once('auth_failure', () => {
          clearTimeout(initTimeout);
          logger.error(`❌ Session ${sessionId} authentication failed`);
        });
      } catch (initError) {
        clearTimeout(initTimeout);
        logger.error(`❌ Error during client initialization for session ${sessionId}:`, initError);
        throw initError;
      }
    } catch (error) {
      logger.error(`Error initializing client for session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Set up enhanced browser monitoring for disconnect detection
   */
  private setupBrowserMonitoring(
    client: Client,
    sessionId: string,
    onBrowserDisconnect: (sessionId: string, disconnectType: string) => Promise<void>
  ): void {
    // Enhanced Browser monitoring - Get puppeteer page for comprehensive event listening
    if (client.pupPage) {
      try {
        const page = client.pupPage;
        if (page && typeof page.browser === 'function') {
          const browser = page.browser();

          // Enhanced browser disconnect events
          browser.on('disconnected', async () => {
            logger.warn(`🚨 Browser disconnected for session ${sessionId}`);
            await onBrowserDisconnect(sessionId, 'BROWSER_CLOSED');
          });

          // Enhanced page events
          page.on('close', async () => {
            logger.warn(`🚨 Browser page closed for session ${sessionId}`);
            await onBrowserDisconnect(sessionId, 'PAGE_CLOSED');
          });

          page.on('error', async error => {
            logger.error(`🚨 Browser page error for session ${sessionId}:`, error);
            await onBrowserDisconnect(sessionId, 'PAGE_ERROR');
          });

          // Additional crash detection events
          (page as any).on('crash', async () => {
            logger.error(`💥 Browser page crashed for session ${sessionId}`);
            await onBrowserDisconnect(sessionId, 'PAGE_CRASHED');
          });

          // Target destroyed detection
          browser.on('targetdestroyed', async target => {
            if (target.url().includes('web.whatsapp.com')) {
              logger.warn(`🎯 WhatsApp target destroyed for session ${sessionId}`);
              await onBrowserDisconnect(sessionId, 'TARGET_DESTROYED');
            }
          });

          // Target crashed detection
          browser.on('targetcrashed', async (target: any) => {
            if (target?.url?.().includes('web.whatsapp.com')) {
              logger.error(`💥 WhatsApp target crashed for session ${sessionId}`);
              await onBrowserDisconnect(sessionId, 'TARGET_CRASHED');
            }
          });

          // Start memory and heartbeat monitoring
          this.startMemoryMonitoring(page, sessionId, onBrowserDisconnect);
          this.startHeartbeatMonitoring(page, sessionId, onBrowserDisconnect);

          logger.info(`🔍 Enhanced browser monitoring setup for session ${sessionId}`);
        }
      } catch (error) {
        logger.warn(
          `⚠️ Could not setup enhanced browser monitoring for session ${sessionId}:`,
          error
        );
      }
    }
  }

  /**
   * Start memory monitoring for a browser page
   */
  private async startMemoryMonitoring(
    page: any,
    sessionId: string,
    onBrowserDisconnect: (sessionId: string, disconnectType: string) => Promise<void>
  ): Promise<void> {
    try {
      // Store monitoring interval reference
      const monitoringKey = `memory_monitor_${sessionId}`;

      const memoryMonitorInterval = setInterval(async () => {
        try {
          // Get browser process info
          const browserProcess = page.browser().process();
          if (!browserProcess) {
            logger.debug(`⚠️ No browser process found for session ${sessionId}`);
            return;
          }

          // Get memory metrics from the page
          const metrics = await page.metrics();
          const memoryUsage = {
            usedJSHeapSize: metrics.JSHeapUsedSize || 0,
            totalJSHeapSize: metrics.JSHeapTotalSize || 0,
            jsHeapSizeLimit: metrics.JSHeapSizeLimit || 0,
            timestamp: new Date().toISOString(),
          };

          // Convert to MB for easier reading
          const usedMB = Math.round(memoryUsage.usedJSHeapSize / (1024 * 1024));
          const totalMB = Math.round(memoryUsage.totalJSHeapSize / (1024 * 1024));
          const limitMB = Math.round(memoryUsage.jsHeapSizeLimit / (1024 * 1024));

          // Define memory thresholds
          const WARNING_THRESHOLD = 500; // 500MB
          const CRITICAL_THRESHOLD = 1000; // 1GB

          // Log memory usage periodically (every 5 minutes)
          const currentTime = Date.now();
          if (!this.lastMemoryLog || currentTime - this.lastMemoryLog > 300000) {
            // 5 minutes
            logger.info(
              `📊 Memory usage for session ${sessionId}: ${usedMB}MB used, ${totalMB}MB total (limit: ${limitMB}MB)`
            );
            this.lastMemoryLog = currentTime;
          }

          // Check for memory warnings
          if (usedMB > CRITICAL_THRESHOLD) {
            logger.error(
              `🚨 CRITICAL memory usage for session ${sessionId}: ${usedMB}MB (>${CRITICAL_THRESHOLD}MB threshold)`
            );

            // Consider triggering disconnect to prevent crash
            setTimeout(async () => {
              logger.warn(
                `💥 Proactively disconnecting session ${sessionId} due to critical memory usage`
              );
              await onBrowserDisconnect(sessionId, 'MEMORY_OVERLOAD');
            }, 10000); // Wait 10 seconds before disconnecting
          } else if (usedMB > WARNING_THRESHOLD) {
            logger.warn(
              `⚠️ High memory usage for session ${sessionId}: ${usedMB}MB (>${WARNING_THRESHOLD}MB threshold)`
            );
          }
        } catch (error) {
          logger.debug(`Error in memory monitoring for session ${sessionId}:`, error);
          // Don't throw - memory monitoring is non-critical
        }
      }, 30000); // Check every 30 seconds

      // Store interval reference for cleanup
      this.monitoringIntervals.set(monitoringKey, memoryMonitorInterval);

      logger.debug(`📊 Memory monitoring started for session ${sessionId}`);
    } catch (error) {
      logger.warn(`Error starting memory monitoring for session ${sessionId}:`, error);
    }
  }

  /**
   * Start heartbeat monitoring for a browser page
   */
  private async startHeartbeatMonitoring(
    page: any,
    sessionId: string,
    onBrowserDisconnect: (sessionId: string, disconnectType: string) => Promise<void>
  ): Promise<void> {
    try {
      const heartbeatKey = `heartbeat_${sessionId}`;
      let consecutiveFailures = 0;
      const MAX_FAILURES = 3;

      const heartbeatInterval = setInterval(async () => {
        try {
          // Perform a simple page evaluation to check if browser is responsive
          const isAlive = await page.evaluate(() => {
            // Simple check - if this executes, the page is responsive
            return document.readyState && window.location.href;
          });

          if (isAlive) {
            // Reset failure counter on successful heartbeat
            if (consecutiveFailures > 0) {
              logger.info(
                `💚 Session ${sessionId} heartbeat recovered after ${consecutiveFailures} failures`
              );
              consecutiveFailures = 0;
            }

            logger.debug(`💓 Heartbeat OK for session ${sessionId}`);
          } else {
            throw new Error('Page evaluation returned falsy value');
          }
        } catch (error) {
          consecutiveFailures++;
          logger.warn(
            `💔 Heartbeat failed for session ${sessionId} (failure ${consecutiveFailures}/${MAX_FAILURES}):`,
            error.message
          );

          // If we've reached max failures, consider the session dead
          if (consecutiveFailures >= MAX_FAILURES) {
            logger.error(
              `💀 Session ${sessionId} heartbeat failed ${MAX_FAILURES} times consecutively - marking as disconnected`
            );

            // Clear the heartbeat interval to prevent further checks
            if (this.monitoringIntervals?.has(heartbeatKey)) {
              clearInterval(this.monitoringIntervals.get(heartbeatKey));
              this.monitoringIntervals.delete(heartbeatKey);
            }

            // Handle as browser disconnect
            await onBrowserDisconnect(sessionId, 'HEARTBEAT_FAILURE');
          }
        }
      }, 60000); // Check every 60 seconds

      // Store interval reference for cleanup
      this.monitoringIntervals.set(heartbeatKey, heartbeatInterval);

      logger.debug(`💓 Heartbeat monitoring started for session ${sessionId}`);
    } catch (error) {
      logger.warn(`Error starting heartbeat monitoring for session ${sessionId}:`, error);
    }
  }

  /**
   * Handle browser disconnect events
   */
  async handleBrowserDisconnect(
    sessionId: string,
    disconnectType: string,
    onStatusUpdate: (sessionId: string, status: string, data?: any) => Promise<void>
  ): Promise<void> {
    try {
      logger.warn(
        `🚨 Handling browser disconnect for session ${sessionId}, type: ${disconnectType}`
      );

      // Update session status immediately
      await onStatusUpdate(sessionId, 'disconnected', {
        lastError: `Browser disconnected: ${disconnectType}`,
        metadata: {
          disconnectType,
          autoReconnect: false,
          lastHealthCheck: new Date().toISOString(),
        },
      });

      // Clean up monitoring intervals
      this.cleanupMonitoring(sessionId);

      logger.info(`✅ Browser disconnect handled for session ${sessionId}`);
    } catch (error) {
      logger.error(`❌ Error handling browser disconnect for session ${sessionId}:`, error);
    }
  }

  /**
   * Clean up monitoring intervals for a session
   */
  cleanupMonitoring(sessionId: string): void {
    const memoryKey = `memory_monitor_${sessionId}`;
    const heartbeatKey = `heartbeat_${sessionId}`;

    if (this.monitoringIntervals.has(memoryKey)) {
      clearInterval(this.monitoringIntervals.get(memoryKey));
      this.monitoringIntervals.delete(memoryKey);
      logger.debug(`🧹 Memory monitoring cleaned up for session ${sessionId}`);
    }

    if (this.monitoringIntervals.has(heartbeatKey)) {
      clearInterval(this.monitoringIntervals.get(heartbeatKey));
      this.monitoringIntervals.delete(heartbeatKey);
      logger.debug(`🧹 Heartbeat monitoring cleaned up for session ${sessionId}`);
    }
  }

  /**
   * Destroy client and cleanup resources
   */
  async destroyClient(client: Client, sessionId: string): Promise<void> {
    try {
      // Clean up monitoring first
      this.cleanupMonitoring(sessionId);

      // Destroy the client
      await client.destroy();
      logger.info(`WhatsApp client for session ${sessionId} destroyed successfully`);
    } catch (error) {
      logger.warn(`Error destroying WhatsApp client for session ${sessionId}:`, error);
      // Continue with cleanup even if client destruction fails
    }
  }

  /**
   * Check if monitoring intervals exist for a session
   */
  hasMonitoring(sessionId: string): boolean {
    const memoryKey = `memory_monitor_${sessionId}`;
    const heartbeatKey = `heartbeat_${sessionId}`;
    return this.monitoringIntervals.has(memoryKey) || this.monitoringIntervals.has(heartbeatKey);
  }

  /**
   * Get monitoring status for a session
   */
  getMonitoringStatus(sessionId: string): {
    hasMemoryMonitoring: boolean;
    hasHeartbeatMonitoring: boolean;
  } {
    const memoryKey = `memory_monitor_${sessionId}`;
    const heartbeatKey = `heartbeat_${sessionId}`;

    return {
      hasMemoryMonitoring: this.monitoringIntervals.has(memoryKey),
      hasHeartbeatMonitoring: this.monitoringIntervals.has(heartbeatKey),
    };
  }

  /**
   * Clean up all monitoring intervals (shutdown)
   */
  cleanupAllMonitoring(): void {
    logger.info('🧹 Cleaning up all connection monitoring intervals');

    for (const [key, interval] of this.monitoringIntervals) {
      clearInterval(interval);
      logger.debug(`🧹 Cleaned up monitoring interval: ${key}`);
    }

    this.monitoringIntervals.clear();
    logger.info('✅ All connection monitoring cleaned up');
  }
}

export default new ConnectionManager();
