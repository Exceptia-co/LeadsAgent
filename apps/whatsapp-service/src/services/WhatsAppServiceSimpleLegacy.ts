import { Client, LocalAuth, Message } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { logger } from '../utils/logger';
import advancedLogger from '../utils/advancedLogger';
import { WhatsAppMessage, WhatsAppSession, WebhookPayload, SendMessageResponse } from '../types';
import { SessionCleanupUtil } from '../utils/sessionCleanup';
import PhoneNumberService from './PhoneNumberService';
import SessionPersistenceService from './SessionPersistenceService';
import SessionRecoveryService from './SessionRecoveryService';
import SessionHealthCheckService from './SessionHealthCheckService';
import fs from 'fs';
import path from 'path';

class WhatsAppServiceSimple {
  private clients: Map<string, Client> = new Map();
  private sessions: Map<string, WhatsAppSession> = new Map();
  private webhookUrl: string | undefined;

  // Enhanced monitoring properties
  private monitoringIntervals: Map<string, NodeJS.Timeout> = new Map();
  private lastMemoryLog: number = 0;

  constructor() {
    this.webhookUrl = process.env.WEBHOOK_URL;
  }

  async initialize(): Promise<void> {
    logger.info('🚀 Iniciando WhatsApp service con persistencia y monitoreo avanzado...');

    // Recover existing sessions from database using smart filtering
    // TEMPORARY FIX: Disable auto-recovery to prevent multiple Chrome windows
    if (process.env.WHATSAPP_ENABLE_AUTO_RECOVERY === 'true') {
      try {
        logger.info('🤖 Using smart session recovery with intelligent filtering...');
        const recoveryResult = await SessionRecoveryService.recoverSessionsWithSmartFiltering(
          this,
          {
            validateAuthFiles: true,
            cleanupCorruptedAuth: true,
            maxReconnectAttempts: 3,
          }
        );
        logger.info(
          `📊 Smart recovery completed: ${recoveryResult.recoveredSessions}/${recoveryResult.totalSessions} sessions recovered, ${recoveryResult.skippedSessions} skipped`
        );

        if (recoveryResult.errors.length > 0) {
          logger.warn('⚠️ Errors during smart recovery:', recoveryResult.errors);
        }
      } catch (error) {
        logger.error('❌ Error during smart session recovery:', error);
      }
    } else {
      logger.info('⏸️ Auto-recovery disabled. Sessions must be created manually from dashboard.');
      logger.info(
        '💡 Set WHATSAPP_ENABLE_AUTO_RECOVERY=true in .env to enable automatic session recovery.'
      );
    }

    // Start periodic health checks (legacy)
    SessionRecoveryService.scheduleHealthChecks(this);

    // Start advanced health monitoring
    SessionHealthCheckService.startMonitoring(this);

    // Register alert callback for logging
    SessionHealthCheckService.onAlert(alert => {
      logger.warn(
        `🚨 Health Alert [${alert.severity.toUpperCase()}] ${alert.sessionId}: ${alert.message}`,
        {
          type: alert.type,
          recommendation: alert.recommendation,
          timestamp: alert.timestamp,
        }
      );
    });

    logger.info(
      '✅ WhatsApp service initialized successfully with database persistence and health monitoring'
    );
  }

  async createSession(sessionId: string): Promise<WhatsAppSession> {
    try {
      if (this.clients.has(sessionId)) {
        throw new Error(`Session ${sessionId} already exists`);
      }

      // Ensure auth directory exists
      const authDataPath = path.resolve('./wwebjs_auth');
      await this.ensureAuthDirectoryExists(authDataPath);

      // Validate existing authentication files for integrity
      const authIsValid = await this.validateAuthFiles(sessionId, authDataPath);
      if (!authIsValid) {
        logger.warn(`⚠️ Invalid auth files detected for session ${sessionId}, cleaning up...`);
        await this.cleanupCorruptedAuthFiles(sessionId, authDataPath);
      }

      // Create WhatsApp client with session authentication
      const client = new Client({
        authStrategy: new LocalAuth({
          clientId: sessionId,
          dataPath: authDataPath, // Directorio persistente para autenticación
        }),
        puppeteer: {
          headless:
            process.env.PUPPETEER_HEADLESS === 'true' || process.env.NODE_ENV === 'production',
          executablePath: process.env.CHROME_EXECUTABLE_PATH || undefined,
          devtools: process.env.NODE_ENV === 'development',
          // Configuración optimizada para estabilidad
          timeout: 120000, // 2 minutos timeout para inicialización
          args: [
            // Seguridad básica (requerido)
            '--no-sandbox',
            '--disable-setuid-sandbox',

            // Optimización de memoria (problemas comunes)
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-gpu-sandbox',
            '--no-first-run',

            // Estabilidad de WhatsApp Web
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',

            // Prevención de memory leaks
            '--memory-pressure-off',
            '--max_old_space_size=4096',

            // Windows específicos
            '--disable-win32k-lockdown',
            '--disable-component-cloud-policy',
            '--disable-domain-reliability',

            // Configuración de usuario
            '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',

            // Logging mejorado para debugging
            ...(process.env.NODE_ENV === 'development'
              ? ['--enable-logging=stderr', '--log-level=1']
              : []),
          ],
        },
      });

      // Create session object
      const session: WhatsAppSession = {
        id: sessionId,
        clientId: sessionId,
        status: 'connecting',
        lastSeen: new Date(),
        webhookUrl: this.webhookUrl,
      };

      // Set up event listeners
      this.setupClientEventListeners(client, sessionId);

      // Store client and session in memory
      this.clients.set(sessionId, client);
      this.sessions.set(sessionId, session);

      // Persist session to database with enhanced LocalAuth metadata
      const authFileInfo = await this.getAuthFileInfo(sessionId, authDataPath);
      await SessionPersistenceService.saveSession({
        sessionId: sessionId,
        name: sessionId,
        status: 'connecting',
        lastSeen: new Date(),
        webhookUrl: this.webhookUrl,
        isActive: true,
        reconnectCount: 0,
        metadata: {
          clientId: sessionId,
          authDataPath: authDataPath,
          authFileExists: authFileInfo.exists,
          authFileSize: authFileInfo.size,
          authFileModified: authFileInfo.modified,
          sessionCreated: new Date().toISOString(),
          localAuthVersion: '1.0',
        },
      });

      // Initialize the client with enhanced error handling
      logger.info(`🚀 Initializing WhatsApp client for session ${sessionId}...`);

      // Add initialization timeout and error handling
      const initTimeout = setTimeout(() => {
        logger.error(`⏰ Session ${sessionId} initialization timeout after 2 minutes`);
        this.handleBrowserDisconnect(sessionId, 'INIT_TIMEOUT');
      }, 120000); // 2 minutes timeout

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

      logger.info(`📱 WhatsApp session ${sessionId} created and persisted successfully`);
      return session;
    } catch (error) {
      logger.error(`Error creating session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): WhatsAppSession | null {
    return this.sessions.get(sessionId) || null;
  }

  private setupClientEventListeners(client: Client, sessionId: string): void {
    // 🔍 Enhanced Browser monitoring - Get puppeteer page for comprehensive event listening
    if (client.pupPage) {
      // Access pupPage directly as it's a Page object, not a Promise
      try {
        const page = client.pupPage;
        if (page && typeof page.browser === 'function') {
          const browser = page.browser();

          // Enhanced browser disconnect events
          browser.on('disconnected', async () => {
            logger.warn(`🚨 Browser disconnected for session ${sessionId}`);
            await this.handleBrowserDisconnect(sessionId, 'BROWSER_CLOSED');
          });

          // Enhanced page events
          page.on('close', async () => {
            logger.warn(`🚨 Browser page closed for session ${sessionId}`);
            await this.handleBrowserDisconnect(sessionId, 'PAGE_CLOSED');
          });

          page.on('error', async error => {
            logger.error(`🚨 Browser page error for session ${sessionId}:`, error);
            await this.handleBrowserDisconnect(sessionId, 'PAGE_ERROR');
          });

          // NEW: Additional crash detection events
          (page as any).on('crash', async () => {
            logger.error(`💥 Browser page crashed for session ${sessionId}`);
            await this.handleBrowserDisconnect(sessionId, 'PAGE_CRASHED');
          });

          // NEW: Target destroyed detection
          browser.on('targetdestroyed', async target => {
            if (target.url().includes('web.whatsapp.com')) {
              logger.warn(`🎯 WhatsApp target destroyed for session ${sessionId}`);
              await this.handleBrowserDisconnect(sessionId, 'TARGET_DESTROYED');
            }
          });

          // NEW: Target crashed detection
          browser.on('targetcrashed', async target => {
            if (target.url().includes('web.whatsapp.com')) {
              logger.error(`💥 WhatsApp target crashed for session ${sessionId}`);
              await this.handleBrowserDisconnect(sessionId, 'TARGET_CRASHED');
            }
          });

          // NEW: Process memory monitoring
          this.startMemoryMonitoring(page, sessionId);

          // NEW: Heartbeat monitoring
          this.startHeartbeatMonitoring(page, sessionId);

          logger.info(`🔍 Enhanced browser monitoring setup for session ${sessionId}`);
        }
      } catch (error) {
        logger.warn(
          `⚠️ Could not setup enhanced browser monitoring for session ${sessionId}:`,
          error
        );
      }
    }

    // QR Code event
    client.on('qr', async qr => {
      logger.info(`QR Code generated for session ${sessionId}`);

      // Generate QR code for terminal display (development)
      if (process.env.NODE_ENV !== 'production') {
        qrcode.generate(qr, { small: true });
      }

      // Store QR code in session
      this.updateSessionStatus(sessionId, 'connecting', { qrCode: qr });

      // Send webhook
      await this.sendWebhook({
        event: 'qr_updated',
        sessionId,
        data: { qrCode: qr },
        timestamp: new Date().toISOString(),
      });
    });

    // Ready event
    client.on('ready', async () => {
      logger.info(`WhatsApp client ${sessionId} is ready`);

      const clientInfo = client.info;

      // Advanced logging de evento de sesión
      advancedLogger.logSessionEvent({
        sessionId,
        eventType: 'READY',
        phoneNumber: clientInfo?.wid?.user || 'unknown',
        authState: 'AUTHENTICATED',
        metadata: {
          clientInfo: {
            number: clientInfo?.wid?.user,
            pushname: clientInfo?.pushname,
            platform: clientInfo?.platform,
          },
        },
      });

      this.updateSessionStatus(sessionId, 'ready', {
        connectedNumber: clientInfo?.wid?.user || 'unknown',
        lastHealthCheck: new Date(),
      });

      // Send webhook
      await this.sendWebhook({
        event: 'authenticated',
        sessionId,
        data: { number: clientInfo?.wid?.user },
        timestamp: new Date().toISOString(),
      });
    });

    // Authenticated event
    client.on('authenticated', async () => {
      logger.info(`WhatsApp client ${sessionId} authenticated`);
      this.updateSessionStatus(sessionId, 'authenticated');

      // Get client info to send webhook
      const clientInfo = client.info;

      // Send webhook for authenticated event
      await this.sendWebhook({
        event: 'authenticated',
        sessionId,
        data: { number: clientInfo?.wid?.user || 'unknown' },
        timestamp: new Date().toISOString(),
      });
    });

    // Authentication failure event
    client.on('auth_failure', async msg => {
      logger.error(`Authentication failed for session ${sessionId}:`, msg);
      this.updateSessionStatus(sessionId, 'auth_failure', {
        lastError: `Authentication failed: ${msg}`,
      });

      // Send webhook
      await this.sendWebhook({
        event: 'status_change',
        sessionId,
        data: { status: 'auth_failure', message: msg },
        timestamp: new Date().toISOString(),
      });
    });

    // Disconnected event - Enhanced with reason detection
    client.on('disconnected', async reason => {
      logger.info(`WhatsApp client ${sessionId} disconnected:`, reason);

      // Detect if this is a browser closure vs network issue
      let disconnectReason = 'WHATSAPP_DISCONNECT';
      if (reason && typeof reason === 'string') {
        if (reason.includes('Target closed') || reason.includes('Page closed')) {
          disconnectReason = 'BROWSER_CLOSED';
        } else if (reason.includes('Navigation failed') || reason.includes('net::ERR_')) {
          disconnectReason = 'NETWORK_ERROR';
        }
      }

      await this.handleSessionDisconnect(sessionId, disconnectReason, reason);

      // Send webhook
      await this.sendWebhook({
        event: 'disconnected',
        sessionId,
        data: { reason, disconnectType: disconnectReason },
        timestamp: new Date().toISOString(),
      });
    });

    // State change event - Detect WhatsApp Web states
    client.on('change_state', async state => {
      logger.info(`WhatsApp client ${sessionId} state changed:`, state);

      // Handle different WhatsApp Web states
      if (state === 'UNPAIRED' || state === 'UNPAIRED_IDLE') {
        logger.warn(`Session ${sessionId} became unpaired, marking as disconnected`);
        await this.handleSessionDisconnect(sessionId, 'WHATSAPP_UNPAIRED', `State: ${state}`);
      } else if (state === 'TIMEOUT') {
        logger.warn(`Session ${sessionId} timed out`);
        await this.handleSessionDisconnect(sessionId, 'WHATSAPP_TIMEOUT', `State: ${state}`);
      }
    });

    // Loading screen event - Detect when WhatsApp Web shows loading screen
    client.on('loading_screen', async (percent: string, message: string) => {
      logger.debug(`Session ${sessionId} loading: ${percent}% - ${message}`);
      // Convert percent to number for comparison
      const percentNum = parseInt(percent) || 0;
      if (percentNum === 0) {
        // WhatsApp Web is reloading, might indicate connection issues
        this.updateSessionStatus(sessionId, 'connecting', {
          lastHealthCheck: new Date(),
          metadata: { loading: true, loadingMessage: message },
        });
      }
    });

    // Message event
    client.on('message', async (message: Message) => {
      try {
        // Update last health check on successful message receipt
        this.updateSessionStatus(sessionId, this.sessions.get(sessionId)?.status || 'ready', {
          lastHealthCheck: new Date(),
        });

        const whatsappMessage = await this.parseMessage(message, sessionId);
        logger.info(`Message received in session ${sessionId}:`, {
          from: whatsappMessage.from,
          body: whatsappMessage.body.substring(0, 100),
        });

        // Process with AI only if it's not from us AND if sender is in whitelist
        if (!whatsappMessage.fromMe && whatsappMessage.body.trim()) {
          const whitelistResult = await this.checkPhoneNumberAllowedWithLog(
            whatsappMessage.from,
            sessionId,
            whatsappMessage.body
          );
          if (whitelistResult.allowed) {
            logger.info(`📱 Respuesta automática permitida para: ${whatsappMessage.from}`);
            await this.processMessageWithAI(message, whatsappMessage, sessionId);
          } else {
            logger.info(
              `🚫 Respuesta automática bloqueada para: ${whatsappMessage.from} - ${whitelistResult.reason}`
            );
          }
        }

        // Send webhook with message (always, regardless of AI processing)
        await this.sendWebhook({
          event: 'message',
          sessionId,
          data: whatsappMessage,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logger.error(`Error processing message in session ${sessionId}:`, error);
      }
    });
  }

  private async parseMessage(message: Message, sessionId: string): Promise<WhatsAppMessage> {
    const contact = await message.getContact();
    const chat = await message.getChat();

    return {
      id: message.id._serialized,
      from: contact.id._serialized,
      to: message.to,
      body: message.body,
      timestamp: message.timestamp,
      type: message.type as any,
      isGroup: chat.isGroup,
      fromMe: message.fromMe,
    };
  }

  /**
   * Normalize phone number for WhatsApp Web compatibility
   * Removes '+' prefix and ensures proper formatting
   */
  private normalizePhoneNumber(phoneNumber: string): string {
    if (!phoneNumber) {
      throw new Error('Phone number is required');
    }

    // Remove WhatsApp suffix if present
    let normalized = phoneNumber.replace(/@c\.us$/, '').replace(/@g\.us$/, '');

    // Remove '+' prefix that causes issues with WhatsApp Web
    normalized = normalized.replace(/^\+/, '');

    // Remove any spaces, dashes, or parentheses
    normalized = normalized.replace(/[\s\-\(\)]/g, '');

    // Ensure it's only digits
    normalized = normalized.replace(/[^\d]/g, '');

    // Validate the result
    if (!normalized || normalized.length < 8 || normalized.length > 15) {
      throw new Error(`Invalid phone number format: ${phoneNumber}. Expected 8-15 digits.`);
    }

    logger.debug(`📞 Phone normalization: ${phoneNumber} → ${normalized}`);

    return normalized;
  }

  async sendMessage(sessionId: string, to: string, message: string): Promise<SendMessageResponse> {
    try {
      const client = this.clients.get(sessionId);
      if (!client) {
        return {
          success: false,
          error: `Session ${sessionId} not found`,
        };
      }

      const session = this.sessions.get(sessionId);
      if (!session || session.status !== 'ready') {
        return {
          success: false,
          error: `Session ${sessionId} is not ready. Status: ${session?.status || 'not found'}`,
        };
      }

      // Update health check on successful message sending attempt
      this.updateSessionStatus(sessionId, 'ready', {
        lastHealthCheck: new Date(),
      });

      // Normalize phone number for WhatsApp Web compatibility
      let normalizedNumber: string;
      try {
        normalizedNumber = this.normalizePhoneNumber(to);
      } catch (normalizationError) {
        const errorMessage =
          normalizationError instanceof Error
            ? normalizationError.message
            : 'Invalid phone number format';

        logger.error(`📞 Phone normalization failed for ${to}:`, errorMessage);
        return {
          success: false,
          error: `Phone number validation failed: ${errorMessage}`,
        };
      }
      const formattedNumber = normalizedNumber.includes('@c.us')
        ? normalizedNumber
        : `${normalizedNumber}@c.us`;

      logger.info(`📞 WhatsApp Service - Attempting to send message:`, {
        sessionId,
        originalNumber: to,
        normalizedNumber,
        formattedNumber,
        messagePreview: message.substring(0, 50) + '...',
      });

      const sentMessage = await client.sendMessage(formattedNumber, message);

      logger.info(`Message sent successfully in session ${sessionId}`, {
        to: formattedNumber,
        messageId: sentMessage.id._serialized,
      });

      // Update health check on successful message sent
      this.updateSessionStatus(sessionId, 'ready', {
        lastHealthCheck: new Date(),
      });

      return {
        success: true,
        messageId: sentMessage.id._serialized,
      };
    } catch (error) {
      logger.error(`Error sending message in session ${sessionId}:`, error);

      // Check if error indicates session is dead
      if (error instanceof Error) {
        const errorMsg = error.message.toLowerCase();
        if (
          errorMsg.includes('target closed') ||
          errorMsg.includes('page closed') ||
          errorMsg.includes('session closed')
        ) {
          logger.warn(`Session ${sessionId} appears to be closed, marking as disconnected`);
          await this.handleSessionDisconnect(sessionId, 'SESSION_DEAD', error.message);
        }
      }

      // Provide more specific error messages for common issues
      let errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('Evaluation failed')) {
        errorMessage =
          'WhatsApp Web evaluation failed - possibly due to invalid phone number format or session state';
      } else if (errorMessage.includes('net::ERR_')) {
        errorMessage = 'Network error - check internet connection';
      } else if (errorMessage.includes('Target closed')) {
        errorMessage = 'WhatsApp session was closed unexpectedly';
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  async getSessionStatus(sessionId: string): Promise<WhatsAppSession | null> {
    return this.sessions.get(sessionId) || null;
  }

  async getAllSessions(): Promise<WhatsAppSession[]> {
    const sessions: WhatsAppSession[] = [];
    this.sessions.forEach(session => sessions.push(session));
    return sessions;
  }

  async destroySession(sessionId: string): Promise<void> {
    try {
      logger.info(`🗑️ Starting destruction of session ${sessionId}`);

      const client = this.clients.get(sessionId);
      if (client) {
        try {
          // Intentar cerrar el cliente gracefully
          await client.destroy();
          logger.info(`WhatsApp client for session ${sessionId} destroyed successfully`);
        } catch (clientError) {
          logger.warn(`Error destroying WhatsApp client for session ${sessionId}:`, clientError);
          // Continuar con la limpieza aunque el cliente falle
        }
        this.clients.delete(sessionId);
      }

      // Remover de la lista de sesiones en memoria
      this.sessions.delete(sessionId);

      // Deactivate session in database
      try {
        await SessionPersistenceService.deactivateSession(sessionId);
        logger.info(`Session ${sessionId} deactivated in database`);
      } catch (dbError) {
        logger.error(`Error deactivating session ${sessionId} in database:`, dbError);
        // Continue with cleanup even if database update fails
      }

      // Usar la utilidad de limpieza segura para archivos
      try {
        await SessionCleanupUtil.cleanupSession(sessionId, './sessions');
        logger.info(`Session ${sessionId} files cleaned up successfully`);
      } catch (cleanupError) {
        logger.error(`Error cleaning up session ${sessionId} files:`, cleanupError);
        // No lanzar el error para permitir que la aplicación continúe
      }

      logger.info(`✅ Session ${sessionId} destroyed completely`);
    } catch (error) {
      logger.error(`❌ Error destroying session ${sessionId}:`, error);

      // Aún así, intentar limpiar la sesión de las estructuras de datos
      this.clients.delete(sessionId);
      this.sessions.delete(sessionId);

      // Try to deactivate in database even on error
      try {
        await SessionPersistenceService.deactivateSession(sessionId);
      } catch (dbError) {
        logger.error(`Final database cleanup failed for session ${sessionId}:`, dbError);
      }

      // Intentar limpieza de archivos como último recurso
      try {
        await SessionCleanupUtil.cleanupSession(sessionId, './sessions');
      } catch (cleanupError) {
        logger.error(`Final cleanup attempt failed for session ${sessionId}:`, cleanupError);
      }

      throw error;
    }
  }

  private async updateSessionStatus(
    sessionId: string,
    status: WhatsAppSession['status'],
    data?: any
  ): Promise<void> {
    // Update in-memory session
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = status;
      session.lastSeen = new Date();
      if (data) {
        Object.assign(session, data);
      }
    }

    // Persist to database asynchronously
    try {
      await SessionPersistenceService.updateSessionStatus(sessionId, status, data);
    } catch (error) {
      logger.error(`Error persisting session status update for ${sessionId}:`, error);
      // Don't throw - continue execution even if persistence fails
    }
  }

  private async processMessageWithAI(
    originalMessage: Message,
    whatsappMessage: WhatsAppMessage,
    sessionId: string
  ): Promise<void> {
    const startTime = Date.now();
    let aiResponse: string = '';
    let knowledgeBaseIdsUsed: string[] = [];

    try {
      logger.info(`🧠 Processing message with enhanced AI thinking for session ${sessionId}`);

      // Import services dynamically to avoid circular dependencies
      const { default: AIThinkingService } = await import('./AIThinkingService');
      const { default: DatabaseService } = await import('./DatabaseService');
      const { default: AILearningService } = await import('./AILearningService');

      // Get phone number without WhatsApp suffix
      const phoneNumber = whatsappMessage.from.replace('@c.us', '');

      // Enhanced processing with structured thinking
      const thinkingResult = await AIThinkingService.processWithThinking(whatsappMessage.body, {
        from: whatsappMessage.from,
        sessionId: sessionId,
        phoneNumber: phoneNumber,
      });

      // Extract knowledge base IDs used from knowledge retrieval step
      const knowledgeStep = thinkingResult.thinkingProcess.steps.find(
        s => s.type === 'knowledge_retrieval'
      );
      knowledgeBaseIdsUsed = knowledgeStep?.data?.map((item: any) => item.id).filter(Boolean) || [];

      logger.info(
        `🧠 [THINKING RESULT] Decision: ${thinkingResult.thinkingProcess.shouldRespond ? 'RESPOND' : 'NO RESPONSE'}`,
        {
          confidence: thinkingResult.thinkingProcess.confidence,
          processingTime: thinkingResult.thinkingProcess.processingTimeMs,
          steps: thinkingResult.thinkingProcess.steps.length,
          complexity: thinkingResult.thinkingProcess.estimatedComplexity,
          finalDecision: thinkingResult.thinkingProcess.finalDecision,
        }
      );

      // Log detailed thinking process for debugging
      thinkingResult.thinkingProcess.steps.forEach((step, index) => {
        logger.debug(`🧠 [STEP ${step.step}] ${step.title}:`, {
          type: step.type,
          content: step.content.substring(0, 150),
          confidence: step.confidence,
        });
      });

      if (
        thinkingResult.thinkingProcess.shouldRespond &&
        thinkingResult.success &&
        thinkingResult.content
      ) {
        aiResponse = thinkingResult.content;

        // Calculate enhanced delay based on thinking complexity
        const complexityDelayMultiplier = {
          simple: 1.0,
          medium: 1.3,
          complex: 1.8,
        }[thinkingResult.thinkingProcess.estimatedComplexity];

        // Add humanized delay with complexity factor
        await this.addHumanizedDelayEnhanced(
          whatsappMessage.body,
          thinkingResult.thinkingProcess,
          complexityDelayMultiplier
        );

        // Determine sending method based on strategy
        const strategy = thinkingResult.thinkingProcess.responseStrategy;
        await this.sendResponseWithStrategy(originalMessage, thinkingResult.content, strategy);

        // Save enhanced conversation data to database
        await DatabaseService.saveConversation({
          sessionId: sessionId,
          phoneNumber: phoneNumber,
          messageText: whatsappMessage.body,
          responseText: undefined,
          messageType: whatsappMessage.type,
          intent: thinkingResult.thinkingProcess.steps[0]?.data?.intent || 'unknown',
          sentiment: thinkingResult.thinkingProcess.steps[0]?.data?.sentiment || 'neutral',
          aiProvider: thinkingResult.provider,
          tokensUsed: thinkingResult.tokensUsed || 0,
          isFromUser: true,
        });

        // Save AI response
        await DatabaseService.saveConversation({
          sessionId: sessionId,
          phoneNumber: phoneNumber,
          messageText: thinkingResult.content,
          responseText: undefined,
          messageType: 'text',
          intent: thinkingResult.thinkingProcess.steps[0]?.data?.intent || 'response',
          sentiment: 'neutral',
          aiProvider: thinkingResult.provider,
          tokensUsed: 0,
          isFromUser: false,
        });

        // Calculate success metrics for learning
        const responseTime = Date.now() - startTime;

        // Schedule success score calculation and logging after a delay
        // to allow time for user to respond (indicating conversation continuation)
        setTimeout(async () => {
          await this.logSuccessfulInteraction(
            whatsappMessage.body,
            aiResponse,
            knowledgeBaseIdsUsed,
            phoneNumber,
            sessionId,
            responseTime,
            thinkingResult.thinkingProcess.steps[0]?.data?.intent,
            thinkingResult.thinkingProcess.steps[0]?.data?.sentiment
          );
        }, 5000); // Wait 5 seconds before calculating success metrics

        logger.info(`✅ Enhanced AI response sent successfully to ${phoneNumber}:`, {
          messageLength: thinkingResult.content.length,
          provider: thinkingResult.provider,
          tokensUsed: thinkingResult.tokensUsed,
          thinkingTime: thinkingResult.thinkingProcess.processingTimeMs,
          confidence: thinkingResult.thinkingProcess.confidence,
          strategy: `${strategy.type} (${strategy.tone}, ${strategy.length})`,
        });
      } else {
        // No response decision or error
        const reason = !thinkingResult.thinkingProcess.shouldRespond
          ? thinkingResult.thinkingProcess.finalDecision
          : thinkingResult.error || 'Unknown error';

        logger.info(`❌ No AI response sent to ${phoneNumber}. Reason: ${reason}`);

        // Still save the user message for record keeping
        await DatabaseService.saveConversation({
          sessionId: sessionId,
          phoneNumber: phoneNumber,
          messageText: whatsappMessage.body,
          responseText: undefined,
          messageType: whatsappMessage.type,
          intent: thinkingResult.thinkingProcess.steps[0]?.data?.intent || 'no_response',
          sentiment: thinkingResult.thinkingProcess.steps[0]?.data?.sentiment || 'neutral',
          aiProvider: thinkingResult.provider,
          tokensUsed: 0,
          isFromUser: true,
        });

        // Send intelligent fallback when AI thinking failed with an error
        if (thinkingResult.error) {
          logger.info(
            `🔄 AI thinking failed with error, using intelligent fallback for ${phoneNumber}`
          );
          try {
            const intelligentFallback = await this.generateIntelligentFallback(
              originalMessage,
              phoneNumber
            );
            await originalMessage.reply(intelligentFallback);

            // Log the fallback usage
            await DatabaseService.saveConversation({
              sessionId: sessionId,
              phoneNumber: phoneNumber,
              messageText: intelligentFallback,
              responseText: undefined,
              messageType: 'text',
              intent: 'fallback_response',
              sentiment: 'neutral',
              aiProvider: 'intelligent_fallback',
              tokensUsed: 0,
              isFromUser: false,
            });

            logger.info(`✅ Intelligent fallback sent to ${phoneNumber}`);
          } catch (replyError) {
            logger.error('Error sending intelligent fallback message:', replyError);
            // Only use generic fallback as last resort
            try {
              await originalMessage.reply(
                'Disculpa, en este momento no puedo procesar tu mensaje. Un agente se pondrá en contacto contigo pronto. 😊'
              );
            } catch (finalError) {
              logger.error('Error sending final fallback:', finalError);
            }
          }
        } else if (!thinkingResult.thinkingProcess.shouldRespond) {
          logger.info(
            `🤐 AI decided not to respond to ${phoneNumber}. Reason: ${thinkingResult.thinkingProcess.finalDecision}`
          );
        }
      }
    } catch (error) {
      logger.error('❌ Error in enhanced processMessageWithAI:', error);

      // Get phone number for fallback (define it here since it's in catch block)
      const phoneNumber = whatsappMessage.from.replace('@c.us', '');

      // Send intelligent fallback message on critical error
      try {
        const intelligentFallback = await this.generateIntelligentFallback(
          originalMessage,
          phoneNumber
        );
        await originalMessage.reply(intelligentFallback);
      } catch (replyError) {
        logger.error('Error sending intelligent fallback message:', replyError);
        // Last resort generic message
        try {
          await originalMessage.reply(
            'Gracias por tu mensaje. Un representante te contactará pronto. 👍'
          );
        } catch (finalError) {
          logger.error('Error sending final fallback:', finalError);
        }
      }
    }
  }

  // New method to log successful interactions for AI learning
  private async logSuccessfulInteraction(
    userMessage: string,
    aiResponse: string,
    knowledgeBaseIds: string[],
    phoneNumber: string,
    sessionId: string,
    responseTimeMs: number,
    intent?: string,
    sentiment?: string
  ): Promise<void> {
    try {
      // Import services dynamically
      const AILearningService = await import('./AILearningService');

      // Calculate initial success score based on response time and complexity
      const initialSuccessScore = this.calculateInitialSuccessScore(
        userMessage,
        aiResponse,
        responseTimeMs
      );

      // Prepare contextual metrics
      const contextMetrics = {
        responseTimeMs,
        messageLength: userMessage.length,
        responseLength: aiResponse.length,
        intent: intent || 'unknown',
        sentiment: sentiment || 'neutral',
        timestamp: new Date().toISOString(),
      };

      // Log the training interaction
      await AILearningService.default.logInteraction({
        userMessage,
        aiResponse,
        knowledgeBaseIdsUsed: knowledgeBaseIds,
        successScore: initialSuccessScore,
        contextData: {
          phoneNumber,
          sessionId,
          intent,
          sentiment,
          responseTime: responseTimeMs,
        },
        feedbackMetrics: {
          conversationContinued: false, // Will be updated later
          responseTime: responseTimeMs,
          followUpQuestions: 0,
          userSatisfactionIndicators: [],
        },
      });

      logger.info(
        `📊 Logged training interaction for learning with score: ${initialSuccessScore.toFixed(2)}`,
        {
          phoneNumber,
          messageLength: userMessage.length,
          responseTime: responseTimeMs,
          knowledgeBaseCount: knowledgeBaseIds.length,
        }
      );
    } catch (error) {
      // Non-blocking error handling for learning system
      logger.error('Error logging training interaction:', error);
    }
  }

  // Calculate initial success score based on heuristics
  private calculateInitialSuccessScore(
    userMessage: string,
    aiResponse: string,
    responseTimeMs: number
  ): number {
    // Base score starts at 0.7 (neutral)
    let score = 0.7;

    // Factor 1: Response time penalty (slower = lower score)
    // Scale: 0-5000ms is good, 5000-15000ms is ok, >15000ms is slow
    if (responseTimeMs < 5000) {
      score += 0.1; // Fast response bonus
    } else if (responseTimeMs > 15000) {
      score -= 0.1; // Slow response penalty
    }

    // Factor 2: Response length appropriateness
    // Very short messages (<20 chars) should have concise responses
    // Longer messages might need longer responses
    const responseRatio = aiResponse.length / Math.max(userMessage.length, 1);
    if (userMessage.length < 20 && aiResponse.length > 200) {
      score -= 0.1; // Too verbose for short question
    } else if (userMessage.length > 100 && aiResponse.length < 50) {
      score -= 0.1; // Too brief for detailed question
    } else if (responseRatio > 0.5 && responseRatio < 5) {
      score += 0.1; // Good ratio of question to answer
    }

    // Factor 3: Presence of questions in user message
    if (
      userMessage.includes('?') ||
      userMessage.toLowerCase().includes('cómo') ||
      userMessage.toLowerCase().includes('qué') ||
      userMessage.toLowerCase().includes('cuándo') ||
      userMessage.toLowerCase().includes('dónde') ||
      userMessage.toLowerCase().includes('por qué')
    ) {
      // Direct questions should be answered thoroughly
      if (aiResponse.length > 100) {
        score += 0.1; // Good detailed answer to question
      }
    }

    // Ensure score stays within bounds 0.0-1.0
    return Math.max(0.0, Math.min(1.0, score));
  }

  private async checkPhoneNumberAllowedWithLog(
    phoneNumberWithSuffix: string,
    sessionId: string,
    messagePreview?: string
  ): Promise<{ allowed: boolean; reason: string; leadInfo?: any }> {
    try {
      // Import the new enhanced WhatsApp Authorization Service
      const { default: WhatsAppAuthorizationService } = await import(
        './WhatsAppAuthorizationService'
      );

      // Remove WhatsApp suffix to get clean phone number
      const phoneNumber = phoneNumberWithSuffix.replace('@c.us', '').replace('@g.us', '');

      logger.debug(`🔍 Checking authorization for phone number: ${phoneNumber}`);

      // Use the enhanced authorization service with all new rules
      const authorizationResult = await WhatsAppAuthorizationService.authorize({
        phoneNumber,
        sessionId,
        messagePreview,
        timestamp: new Date(),
      });

      logger.info(`🔐 Authorization result for ${phoneNumber}: ${authorizationResult.decision}`, {
        reason: authorizationResult.reason,
        confidence: authorizationResult.confidence,
        leadId: authorizationResult.leadInfo?.id,
        leadName: authorizationResult.leadInfo?.name,
        riskFactors: authorizationResult.metadata?.riskFactors,
        allowanceFactors: authorizationResult.metadata?.allowanceFactors,
      });

      // Convert to legacy format for compatibility with existing code
      return {
        allowed: authorizationResult.decision === 'ALLOWED',
        reason: authorizationResult.reason,
        leadInfo: authorizationResult.leadInfo,
      };
    } catch (error) {
      logger.error('Error in enhanced authorization check:', error);

      // Fallback to conservative approach - block unknown numbers
      const phoneNumber = phoneNumberWithSuffix.replace('@c.us', '').replace('@g.us', '');

      // Log the error decision
      try {
        const { default: DatabaseService } = await import('./DatabaseService');
        await DatabaseService.logWhitelistDecision({
          phoneNumber,
          sessionId,
          decision: 'BLOCKED',
          reason: 'Error en sistema de autorización - bloqueado por seguridad',
          messagePreview: messagePreview?.substring(0, 200),
          aiProvider: process.env.AI_PROVIDER || 'unknown',
        });
      } catch (logError) {
        logger.error('Error logging authorization decision:', logError);
      }

      // En caso de error, comportamiento conservador (BLOQUEAR)
      return {
        allowed: false,
        reason: 'Error en sistema de autorización - bloqueado por seguridad',
      };
    }
  }

  // Add humanized delay before responding to simulate human behavior
  private async addHumanizedDelay(messageText: string): Promise<void> {
    // Get delay settings from environment variables
    const minDelay = parseInt(process.env.AI_RESPONSE_DELAY_MIN || '2000'); // 2 seconds default
    const maxDelay = parseInt(process.env.AI_RESPONSE_DELAY_MAX || '6000'); // 6 seconds default

    // Calculate delay based on message length (longer messages = longer thinking time)
    const baseDelay = Math.min(messageText.length * 50, 2000); // 50ms per character, max 2s extra
    const randomDelay = Math.random() * (maxDelay - minDelay) + minDelay;
    const totalDelay = Math.min(randomDelay + baseDelay, maxDelay);

    logger.info(
      `⏱️ Adding humanized delay: ${Math.round(totalDelay)}ms (message length: ${messageText.length})`
    );

    await new Promise(resolve => setTimeout(resolve, totalDelay));
  }

  // Enhanced delay with complexity-based timing
  private async addHumanizedDelayEnhanced(
    messageText: string,
    thinkingProcess: any,
    complexityMultiplier: number = 1.0
  ): Promise<void> {
    // Get delay settings from environment variables
    const minDelay = parseInt(process.env.AI_RESPONSE_DELAY_MIN || '2000');
    const maxDelay = parseInt(process.env.AI_RESPONSE_DELAY_MAX || '8000'); // Increased max for complex thinking

    // Base delay from original method
    const baseDelay = Math.min(messageText.length * 50, 2000);

    // Add thinking complexity factor
    const thinkingDelay = Math.min(thinkingProcess.processingTimeMs * 0.3, 2000); // 30% of thinking time, max 2s

    // Add confidence factor (lower confidence = more "hesitation")
    const confidenceFactor = Math.max(0.5, thinkingProcess.confidence);
    const hesitationDelay = (1 - confidenceFactor) * 1500; // Up to 1.5s hesitation

    // Random variation for human-like behavior
    const randomVariation = Math.random() * 1000;

    // Calculate total delay
    const calculatedDelay =
      (baseDelay + thinkingDelay + hesitationDelay + randomVariation) * complexityMultiplier;

    const totalDelay = Math.max(minDelay, Math.min(calculatedDelay, maxDelay));

    logger.info(`🧠⏱️ Enhanced delay: ${Math.round(totalDelay)}ms`, {
      messageLength: messageText.length,
      complexity: thinkingProcess.estimatedComplexity,
      confidence: thinkingProcess.confidence,
      thinkingTime: thinkingProcess.processingTimeMs,
      multiplier: complexityMultiplier,
    });

    await new Promise(resolve => setTimeout(resolve, totalDelay));
  }

  // Send response with intelligent quoting strategy
  private async sendResponseWithStrategy(
    originalMessage: Message,
    responseText: string,
    strategy: any
  ): Promise<void> {
    try {
      if (
        strategy.shouldQuote ||
        this.shouldQuoteBasedOnContext(originalMessage, responseText, strategy)
      ) {
        // Quote the original message
        await originalMessage.reply(responseText);
        logger.debug('📝 Response sent with quote');
      } else {
        // Send without quoting
        const chat = await originalMessage.getChat();
        await chat.sendMessage(responseText);
        logger.debug('📝 Response sent without quote');
      }
    } catch (error) {
      logger.error('Error in sendResponseWithStrategy:', error);
      // Fallback to simple reply
      await originalMessage.reply(responseText);
    }
  }

  // Determine if we should quote based on message context
  private shouldQuoteBasedOnContext(
    originalMessage: Message,
    responseText: string,
    strategy: any
  ): boolean {
    // Always quote if strategy explicitly says so
    if (strategy.shouldQuote === true) return true;
    if (strategy.shouldQuote === false) return false;

    // Smart quoting logic
    const messageText = originalMessage.body?.toLowerCase() || '';

    // Quote for direct questions
    if (
      messageText.includes('?') ||
      messageText.includes('cuánto') ||
      messageText.includes('cómo') ||
      messageText.includes('qué') ||
      messageText.includes('dónde') ||
      messageText.includes('cuándo')
    ) {
      return true;
    }

    // Quote for complaints or support requests
    if (strategy.tone === 'supportive' || strategy.priority === 'high') {
      return true;
    }

    // Don't quote for simple greetings
    if (
      messageText.includes('hola') ||
      messageText.includes('buenos') ||
      messageText.includes('buenas')
    ) {
      return false;
    }

    // Don't quote for long conversations (default)
    return false;
  }

  /**
   * 🚨 Handle browser disconnect events (window close, browser crash, etc.)
   */
  private async handleBrowserDisconnect(sessionId: string, disconnectType: string): Promise<void> {
    try {
      logger.warn(
        `🚨 Handling browser disconnect for session ${sessionId}, type: ${disconnectType}`
      );

      // Update session status immediately
      await this.updateSessionStatus(sessionId, 'disconnected', {
        lastError: `Browser disconnected: ${disconnectType}`,
        metadata: {
          disconnectType,
          autoReconnect: false,
          lastHealthCheck: new Date().toISOString(),
        },
      });

      // Clean up client reference
      const client = this.clients.get(sessionId);
      if (client) {
        try {
          // Don't call destroy() here as browser is already gone
          this.clients.delete(sessionId);
          logger.info(`✅ Client reference cleaned for session ${sessionId}`);
        } catch (error) {
          logger.error(`Error cleaning client reference for ${sessionId}:`, error);
        }
      }

      // Persist the disconnection state
      try {
        await SessionPersistenceService.updateSessionStatus(sessionId, 'disconnected', {
          lastError: `Browser disconnected: ${disconnectType}`,
          metadata: {
            lastHealthCheck: new Date(),
            disconnectType,
            disconnectedAt: new Date().toISOString(),
            autoReconnect: false,
          },
        });
      } catch (dbError) {
        logger.error(`Error updating database for session ${sessionId}:`, dbError);
      }

      // Send webhook notification
      await this.sendWebhook({
        event: 'browser_closed',
        sessionId,
        data: {
          disconnectType,
          timestamp: new Date().toISOString(),
          autoReconnect: false,
        },
        timestamp: new Date().toISOString(),
      });

      logger.info(`✅ Browser disconnect handled for session ${sessionId}`);
    } catch (error) {
      logger.error(`❌ Error handling browser disconnect for session ${sessionId}:`, error);
    }
  }

  /**
   * 🔌 Handle session disconnect with different strategies based on reason
   */
  private async handleSessionDisconnect(
    sessionId: string,
    disconnectType: string,
    originalReason?: any
  ): Promise<void> {
    try {
      logger.info(`🔌 Handling session disconnect: ${sessionId} - Type: ${disconnectType}`);

      let shouldAutoReconnect = true;
      let errorMessage = `Session disconnected: ${disconnectType}`;

      // Determine reconnection strategy based on disconnect type
      switch (disconnectType) {
        case 'BROWSER_CLOSED':
        case 'PAGE_CLOSED':
        case 'PAGE_ERROR':
          shouldAutoReconnect = false; // User intentionally closed browser
          errorMessage = `Browser was closed by user: ${disconnectType}`;
          break;

        case 'WHATSAPP_UNPAIRED':
        case 'WHATSAPP_TIMEOUT':
          shouldAutoReconnect = false; // WhatsApp Web session expired
          errorMessage = `WhatsApp Web session expired: ${disconnectType}`;
          break;

        case 'NETWORK_ERROR':
          shouldAutoReconnect = true; // Network issues might be temporary
          errorMessage = `Network error: ${originalReason || disconnectType}`;
          break;

        default:
          shouldAutoReconnect = false; // Conservative approach for unknown reasons
          errorMessage = `Unknown disconnect: ${originalReason || disconnectType}`;
      }

      // Update session status
      await this.updateSessionStatus(sessionId, 'disconnected', {
        lastError: errorMessage,
        metadata: {
          disconnectType,
          autoReconnect: shouldAutoReconnect,
          lastHealthCheck: new Date().toISOString(),
        },
      });

      // Clean up client if still exists
      const client = this.clients.get(sessionId);
      if (client) {
        try {
          if (disconnectType !== 'BROWSER_CLOSED' && disconnectType !== 'PAGE_CLOSED') {
            // Only call destroy if browser isn't already gone
            await client.destroy();
          }
          this.clients.delete(sessionId);
        } catch (error) {
          logger.warn(`Error during client cleanup for ${sessionId}:`, error);
          this.clients.delete(sessionId); // Force removal
        }
      }

      // Remove from active sessions
      this.sessions.delete(sessionId);

      // Update database
      try {
        await SessionPersistenceService.updateSessionStatus(sessionId, 'disconnected', {
          lastError: errorMessage,
          metadata: {
            autoReconnect: shouldAutoReconnect,
            disconnectType,
            originalReason: originalReason?.toString() || 'N/A',
            disconnectedAt: new Date().toISOString(),
          },
        });
      } catch (dbError) {
        logger.error(`Error updating database for disconnected session ${sessionId}:`, dbError);
      }

      logger.info(
        `✅ Session disconnect handled: ${sessionId} (autoReconnect: ${shouldAutoReconnect})`
      );
    } catch (error) {
      logger.error(`❌ Error handling session disconnect for ${sessionId}:`, error);
    }
  }

  /**
   * 🛡️ Graceful shutdown - close all sessions cleanly
   */
  async shutdown(): Promise<void> {
    logger.info('🛑 Starting graceful shutdown of WhatsApp service...');

    const sessions = Array.from(this.clients.keys());
    logger.info(`🔄 Shutting down ${sessions.length} active sessions...`);

    // Stop health monitoring
    try {
      SessionHealthCheckService.stopMonitoring();
      logger.info('✅ Health monitoring stopped');
    } catch (error) {
      logger.error('Error stopping health monitoring:', error);
    }

    // Shutdown all sessions with timeout
    const shutdownPromises = sessions.map(async sessionId => {
      return new Promise<void>(resolve => {
        const timeoutId = setTimeout(() => {
          logger.warn(`⚠️ Timeout shutting down session ${sessionId}, forcing cleanup`);
          this.clients.delete(sessionId);
          this.sessions.delete(sessionId);
          resolve();
        }, 10000); // 10 second timeout per session

        this.destroySession(sessionId)
          .then(() => {
            clearTimeout(timeoutId);
            logger.info(`✅ Session ${sessionId} shutdown complete`);
            resolve();
          })
          .catch(error => {
            clearTimeout(timeoutId);
            logger.error(`❌ Error shutting down session ${sessionId}:`, error);
            // Force cleanup even on error
            this.clients.delete(sessionId);
            this.sessions.delete(sessionId);
            resolve();
          });
      });
    });

    try {
      // Wait for all sessions to shutdown (max 30 seconds total)
      await Promise.race([
        Promise.all(shutdownPromises),
        new Promise(resolve => setTimeout(resolve, 30000)),
      ]);

      logger.info('✅ All sessions shutdown completed');
    } catch (error) {
      logger.error('❌ Error during session shutdown:', error);
    }

    // Final cleanup - mark all remaining sessions as disconnected in database
    try {
      const remainingSessions = await SessionPersistenceService.loadActiveSessions();
      for (const session of remainingSessions) {
        await SessionPersistenceService.updateSessionStatus(session.sessionId, 'disconnected', {
          lastError: 'Server shutdown',
          metadata: {
            autoReconnect: false,
            shutdownReason: 'Server shutdown',
            shutdownTimestamp: new Date().toISOString(),
          },
        });
      }
      logger.info(`✅ Database cleanup completed for ${remainingSessions.length} sessions`);
    } catch (error) {
      logger.error('❌ Error during database cleanup:', error);
    }

    logger.info('🏁 WhatsApp service graceful shutdown completed');
  }

  /**
   * 💪 Force disconnect a specific session
   */
  async forceDisconnectSession(sessionId: string): Promise<void> {
    logger.info(`💪 Force disconnecting session ${sessionId}`);

    try {
      // Immediately mark as disconnected
      await this.updateSessionStatus(sessionId, 'disconnected', {
        lastError: 'Force disconnected by user',
        metadata: {
          autoReconnect: false,
          forceDisconnected: true,
          disconnectedAt: new Date().toISOString(),
        },
      });

      // Destroy the session
      await this.destroySession(sessionId);

      // Send webhook notification
      await this.sendWebhook({
        event: 'force_disconnected',
        sessionId,
        data: { timestamp: new Date().toISOString() },
        timestamp: new Date().toISOString(),
      });

      logger.info(`✅ Session ${sessionId} force disconnected successfully`);
    } catch (error) {
      logger.error(`❌ Error force disconnecting session ${sessionId}:`, error);
      throw error;
    }
  }

  // Mantener método original para compatibilidad
  private async isPhoneNumberAllowed(phoneNumberWithSuffix: string): Promise<boolean> {
    const result = await this.checkPhoneNumberAllowedWithLog(
      phoneNumberWithSuffix,
      'unknown',
      undefined
    );
    return result.allowed;
  }

  private async sendWebhook(payload: WebhookPayload): Promise<void> {
    // Emit Socket.IO event first using unified facade
    try {
      const WhatsAppServiceModule = await import('./WhatsAppService');
      const whatsappServiceFacade = WhatsAppServiceModule.default;

      await whatsappServiceFacade.notifySocketEvent(payload);
      logger.debug(`📡 Socket.IO event emitted via facade for: ${payload.event}`);
    } catch (error) {
      logger.warn('⚠️ Failed to emit Socket.IO event via facade:', error);
      // Continue with webhook - don't let Socket.IO errors break webhook functionality
    }

    // Send traditional webhook if configured
    if (!this.webhookUrl) {
      logger.debug('No webhook URL configured, skipping HTTP webhook (Socket.IO event still sent)');
      return;
    }

    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-WhatsApp-Service': 'true',
        },
        body: JSON.stringify(payload),
        // Add timeout to prevent hanging
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      if (!response.ok) {
        logger.warn(
          `⚠️ Webhook failed with status ${response.status} for event ${payload.event}. This won't affect WhatsApp service functionality.`
        );
        return;
      }

      logger.debug(`🚀 HTTP webhook sent successfully for event ${payload.event}`);
    } catch (error: any) {
      // Log warning instead of error to reduce noise, and include helpful context
      logger.warn(`⚠️ Webhook delivery failed for event ${payload.event}:`, {
        error: error.message,
        webhookUrl: this.webhookUrl,
        suggestion: 'Check if the webhook endpoint exists and is accessible',
      });

      // Don't throw error - webhook failures should not interrupt WhatsApp functionality
    }
  }

  private async generateIntelligentFallback(
    originalMessage: Message,
    phoneNumber: string
  ): Promise<string> {
    try {
      logger.info(`🔍 Generating intelligent fallback for ${phoneNumber}`);

      // Import services
      const { default: DatabaseService } = await import('./DatabaseService');
      const { default: AIService } = await import('./AIService');

      const messageText = originalMessage.body || '';

      // Search knowledge base for relevant information
      const knowledgeResults = await DatabaseService.searchKnowledgeBase(messageText);

      if (knowledgeResults.length > 0) {
        logger.info(`📚 Found ${knowledgeResults.length} relevant knowledge base entries`);

        // Use the most relevant entry
        const mostRelevant = knowledgeResults[0];

        // Create a simplified context for AI response
        const context = {
          userMessage: messageText,
          knowledgeTitle: mostRelevant.title,
          knowledgeContent: mostRelevant.content,
          keywords: mostRelevant.keywords,
        };

        // Generate contextual response using AI
        const aiResponse = await AIService.generateResponse(
          `Basándote en esta información de nuestra base de conocimientos, genera una respuesta útil y amigable para el usuario.

Pregunta del usuario: "${messageText}"

Información relevante encontrada:
Título: ${mostRelevant.title}
Contenido: ${mostRelevant.content}
Palabras clave: ${mostRelevant.keywords}

Genera una respuesta que:
1. Sea útil y directa
2. Use un tono amigable
3. Invite a continuar la conversación
4. No sea más de 200 palabras
5. Incluya información relevante de nuestra base de conocimientos

Respuesta:`,
          {
            from: phoneNumber,
            sessionId: 'fallback',
            phoneNumber: phoneNumber.replace('@c.us', ''),
          }
        );

        if (aiResponse.success && aiResponse.content) {
          logger.info('✅ Generated intelligent fallback from knowledge base');
          return aiResponse.content;
        }
      }

      // If no knowledge base results, try to categorize the message and provide smart fallback
      const smartFallback = this.generateSmartGenericFallback(messageText);
      logger.info('🎯 Generated smart generic fallback');
      return smartFallback;
    } catch (error) {
      logger.error('Error generating intelligent fallback:', error);

      // Return smart generic fallback as last resort
      return this.generateSmartGenericFallback(originalMessage.body || '');
    }
  }

  private generateSmartGenericFallback(messageText: string): string {
    const message = messageText.toLowerCase();

    // Categorize message type and provide appropriate response
    if (message.includes('precio') || message.includes('costo') || message.includes('cuánto')) {
      return 'Hola! 💰 Entiendo que consultas sobre precios. Te conectaré con un especialista que puede darte información detallada sobre tarifas y servicios. Un momento por favor.';
    }

    if (message.includes('servicio') || message.includes('qué') || message.includes('cómo')) {
      return 'Hola! 🌟 Veo que tienes consultas sobre nuestros servicios. Te pondré en contacto con un experto que puede resolver todas tus dudas. En unos momentos te contactará.';
    }

    if (
      message.includes('ubicación') ||
      message.includes('dónde') ||
      message.includes('dirección')
    ) {
      return 'Hola! 📍 Te ayudo con información de ubicación. Un agente especializado te contactará muy pronto con todos los detalles que necesitas.';
    }

    if (message.includes('horario') || message.includes('abierto') || message.includes('cerrado')) {
      return 'Hola! ⏰ Te ayudo con información sobre horarios. Un representante te contactará enseguida con todos los detalles.';
    }

    if (message.includes('hola') || message.includes('buenos') || message.includes('buenas')) {
      return 'Hola! 👋 Gracias por contactarnos. Te conectaré con uno de nuestros especialistas que podrá ayudarte de inmediato.';
    }

    if (message.includes('gracias') || message.includes('perfecto') || message.includes('ok')) {
      return 'De nada! 😊 Si tienes alguna otra consulta, no dudes en escribir. Un agente estará disponible para ayudarte.';
    }

    // Default intelligent fallback
    return 'Hola! 👋 He recibido tu mensaje y entiendo que necesitas información. Te pondré en contacto con uno de nuestros especialistas que podrá ayudarte de manera personalizada. En unos momentos te contactará. ¡Gracias por elegirnos!';
  }

  // === LocalAuth Synchronization Methods ===

  /**
   * Ensure the authentication directory exists
   */
  private async ensureAuthDirectoryExists(authDataPath: string): Promise<void> {
    try {
      if (!fs.existsSync(authDataPath)) {
        fs.mkdirSync(authDataPath, { recursive: true });
        logger.info(`🔐 Created auth directory: ${authDataPath}`);
      }
    } catch (error) {
      logger.error('Error creating auth directory:', error);
      throw error;
    }
  }

  /**
   * Validate LocalAuth files for integrity
   */
  private async validateAuthFiles(sessionId: string, authDataPath: string): Promise<boolean> {
    try {
      const sessionAuthPath = path.join(authDataPath, `session-${sessionId}`);

      if (!fs.existsSync(sessionAuthPath)) {
        logger.debug(`🔍 No auth files found for session ${sessionId} (first time setup)`);
        return true; // No files means clean slate, which is valid
      }

      // Check for essential auth files
      const essentialFiles = ['Default', 'RemoteAuth', 'Session Storage'];
      let foundEssentialFiles = 0;

      for (const fileName of essentialFiles) {
        const filePath = path.join(sessionAuthPath, fileName);
        if (fs.existsSync(filePath)) {
          foundEssentialFiles++;
        }
      }

      // Check for common corruption indicators
      const hasLockFiles = await this.hasActiveLockFiles(sessionAuthPath);
      const hasValidStructure = foundEssentialFiles > 0;

      const isValid = hasValidStructure && !hasLockFiles;

      logger.debug(`🔍 Auth validation for ${sessionId}:`, {
        hasValidStructure,
        hasLockFiles,
        foundEssentialFiles,
        isValid,
      });

      return isValid;
    } catch (error) {
      logger.warn(`Error validating auth files for session ${sessionId}:`, error);
      return false; // Assume invalid on error
    }
  }

  /**
   * Check for active lock files that indicate corruption
   */
  private async hasActiveLockFiles(sessionAuthPath: string): Promise<boolean> {
    try {
      const lockFiles = await this.findLockFiles(sessionAuthPath);

      // Check if any lock files are older than 5 minutes (likely abandoned)
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

      for (const lockFile of lockFiles) {
        const stats = fs.statSync(lockFile);
        if (stats.mtime.getTime() < fiveMinutesAgo) {
          return true; // Found stale lock file
        }
      }

      return false;
    } catch (error) {
      logger.debug('Error checking lock files:', error);
      return false;
    }
  }

  /**
   * Find all lock files recursively
   */
  private async findLockFiles(dirPath: string, lockFiles: string[] = []): Promise<string[]> {
    try {
      if (!fs.existsSync(dirPath)) return lockFiles;

      const items = fs.readdirSync(dirPath);

      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stat = fs.statSync(itemPath);

        if (stat.isDirectory()) {
          await this.findLockFiles(itemPath, lockFiles);
        } else if (item === 'LOCK' || item === 'lockfile' || item.endsWith('.lock')) {
          lockFiles.push(itemPath);
        }
      }
    } catch (error) {
      logger.debug(`Error finding lock files in ${dirPath}:`, error);
    }

    return lockFiles;
  }

  /**
   * Clean up corrupted authentication files
   */
  private async cleanupCorruptedAuthFiles(sessionId: string, authDataPath: string): Promise<void> {
    try {
      const sessionAuthPath = path.join(authDataPath, `session-${sessionId}`);

      if (fs.existsSync(sessionAuthPath)) {
        logger.info(`🧹 Cleaning corrupted auth files for session ${sessionId}`);

        // Use the existing SessionCleanupUtil for safe cleanup
        await SessionCleanupUtil.cleanupSession(`auth-${sessionId}`, sessionAuthPath);

        // Update database to reflect cleanup
        await SessionPersistenceService.updateSessionStatus(sessionId, 'connecting', {
          metadata: {
            authCleanupPerformed: new Date().toISOString(),
            authCorruptionDetected: true,
          },
        });

        logger.info(`✅ Corrupted auth files cleaned for session ${sessionId}`);
      }
    } catch (error) {
      logger.error(`Error cleaning corrupted auth files for session ${sessionId}:`, error);
      // Don't throw - allow session creation to continue
    }
  }

  /**
   * Get authentication file information
   */
  private async getAuthFileInfo(
    sessionId: string,
    authDataPath: string
  ): Promise<{
    exists: boolean;
    size: number;
    modified: string | null;
  }> {
    try {
      const sessionAuthPath = path.join(authDataPath, `session-${sessionId}`);

      if (!fs.existsSync(sessionAuthPath)) {
        return {
          exists: false,
          size: 0,
          modified: null,
        };
      }

      const stats = fs.statSync(sessionAuthPath);
      const size = await this.getDirectorySize(sessionAuthPath);

      return {
        exists: true,
        size: Math.round(size / 1024), // Convert to KB
        modified: stats.mtime.toISOString(),
      };
    } catch (error) {
      logger.debug(`Error getting auth file info for ${sessionId}:`, error);
      return {
        exists: false,
        size: 0,
        modified: null,
      };
    }
  }

  /**
   * Calculate directory size recursively
   */
  private async getDirectorySize(dirPath: string): Promise<number> {
    try {
      let totalSize = 0;

      const items = fs.readdirSync(dirPath);

      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stat = fs.statSync(itemPath);

        if (stat.isDirectory()) {
          totalSize += await this.getDirectorySize(itemPath);
        } else {
          totalSize += stat.size;
        }
      }

      return totalSize;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Sync auth state with database metadata
   */
  private async syncAuthStateWithDatabase(sessionId: string): Promise<void> {
    try {
      const authDataPath = path.resolve('./wwebjs_auth');
      const authFileInfo = await this.getAuthFileInfo(sessionId, authDataPath);
      const session = this.sessions.get(sessionId);

      if (session) {
        // Update metadata in database with current auth file state
        await SessionPersistenceService.updateSessionStatus(sessionId, session.status, {
          metadata: {
            authFileExists: authFileInfo.exists,
            authFileSize: authFileInfo.size,
            authFileModified: authFileInfo.modified,
            lastAuthSync: new Date().toISOString(),
            authDataPath: authDataPath,
          },
        });

        logger.debug(`🔄 Auth state synced for session ${sessionId}`, authFileInfo);
      }
    } catch (error) {
      logger.error(`Error syncing auth state for session ${sessionId}:`, error);
      // Non-blocking error - continue execution
    }
  }

  /**
   * Recover session with LocalAuth validation
   */
  async recoverSessionWithAuthValidation(sessionId: string, persistedData: any): Promise<boolean> {
    try {
      logger.info(`🔄 Recovering session ${sessionId} with auth validation`);

      // Validate auth files before attempting recovery
      const authDataPath = path.resolve('./wwebjs_auth');
      const authIsValid = await this.validateAuthFiles(sessionId, authDataPath);

      if (!authIsValid) {
        logger.warn(`⚠️ Invalid auth detected for session ${sessionId} during recovery`);
        await this.cleanupCorruptedAuthFiles(sessionId, authDataPath);

        // Mark as requiring fresh authentication
        await SessionPersistenceService.updateSessionStatus(sessionId, 'connecting', {
          qrCode: undefined, // Clear old QR code
          metadata: {
            ...persistedData.metadata,
            recoveryAuthCleaned: new Date().toISOString(),
          },
        });
      }

      // Proceed with normal session creation
      await this.createSession(sessionId);

      // Sync auth state after creation
      setTimeout(() => {
        this.syncAuthStateWithDatabase(sessionId);
      }, 5000); // Wait 5 seconds for client to initialize

      return true;
    } catch (error) {
      logger.error(`Error recovering session ${sessionId} with auth validation:`, error);
      return false;
    }
  }

  // === Enhanced Monitoring Methods ===

  /**
   * 📊 Start memory monitoring for a browser page
   */
  private async startMemoryMonitoring(page: any, sessionId: string): Promise<void> {
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

            // Update session with memory warning
            await this.updateSessionStatus(
              sessionId,
              this.sessions.get(sessionId)?.status || 'connecting',
              {
                lastHealthCheck: new Date(),
                metadata: {
                  memoryWarning: 'CRITICAL',
                  memoryUsageMB: usedMB,
                  timestamp: new Date().toISOString(),
                },
              }
            );

            // Consider triggering disconnect to prevent crash
            setTimeout(async () => {
              logger.warn(
                `💥 Proactively disconnecting session ${sessionId} due to critical memory usage`
              );
              await this.handleBrowserDisconnect(sessionId, 'MEMORY_OVERLOAD');
            }, 10000); // Wait 10 seconds before disconnecting
          } else if (usedMB > WARNING_THRESHOLD) {
            logger.warn(
              `⚠️ High memory usage for session ${sessionId}: ${usedMB}MB (>${WARNING_THRESHOLD}MB threshold)`
            );

            await this.updateSessionStatus(
              sessionId,
              this.sessions.get(sessionId)?.status || 'connecting',
              {
                lastHealthCheck: new Date(),
                metadata: {
                  memoryWarning: 'HIGH',
                  memoryUsageMB: usedMB,
                  timestamp: new Date().toISOString(),
                },
              }
            );
          }

          // Store metrics for potential analysis
          await SessionPersistenceService.updateSessionStatus(
            sessionId,
            this.sessions.get(sessionId)?.status || 'connecting',
            {
              metadata: {
                lastMemoryCheck: new Date().toISOString(),
                memoryUsage: {
                  usedMB,
                  totalMB,
                  limitMB,
                  utilizationPercent: Math.round((usedMB / limitMB) * 100),
                },
              },
            }
          );
        } catch (error) {
          logger.debug(`Error in memory monitoring for session ${sessionId}:`, error);
          // Don't throw - memory monitoring is non-critical
        }
      }, 30000); // Check every 30 seconds

      // Store interval reference for cleanup
      if (!this.monitoringIntervals) {
        this.monitoringIntervals = new Map();
      }
      this.monitoringIntervals.set(monitoringKey, memoryMonitorInterval);

      logger.debug(`📊 Memory monitoring started for session ${sessionId}`);
    } catch (error) {
      logger.warn(`Error starting memory monitoring for session ${sessionId}:`, error);
    }
  }

  /**
   * 💓 Start heartbeat monitoring for a browser page
   */
  private async startHeartbeatMonitoring(page: any, sessionId: string): Promise<void> {
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

            // Update session with successful heartbeat
            await this.updateSessionStatus(
              sessionId,
              this.sessions.get(sessionId)?.status || 'ready',
              {
                lastHealthCheck: new Date(),
                metadata: {
                  lastHeartbeat: new Date().toISOString(),
                  heartbeatStatus: 'ALIVE',
                  consecutiveFailures: 0,
                },
              }
            );

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

          // Update session with heartbeat failure
          await this.updateSessionStatus(
            sessionId,
            this.sessions.get(sessionId)?.status || 'connecting',
            {
              lastHealthCheck: new Date(),
              metadata: {
                lastHeartbeat: new Date().toISOString(),
                heartbeatStatus: 'FAILED',
                consecutiveFailures: consecutiveFailures,
                lastHeartbeatError: error.message,
              },
            }
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
            await this.handleBrowserDisconnect(sessionId, 'HEARTBEAT_FAILURE');
          }
        }
      }, 60000); // Check every 60 seconds

      // Store interval reference for cleanup
      if (!this.monitoringIntervals) {
        this.monitoringIntervals = new Map();
      }
      this.monitoringIntervals.set(heartbeatKey, heartbeatInterval);

      logger.debug(`💓 Heartbeat monitoring started for session ${sessionId}`);
    } catch (error) {
      logger.warn(`Error starting heartbeat monitoring for session ${sessionId}:`, error);
    }
  }

  /**
   * 🧹 Clean up monitoring intervals for a session
   */
  private cleanupMonitoring(sessionId: string): void {
    if (!this.monitoringIntervals) return;

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
}

export default new WhatsAppServiceSimple();
