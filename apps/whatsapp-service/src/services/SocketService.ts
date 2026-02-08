import type { Server as HTTPServer } from 'http';
import type { Socket } from 'socket.io';
import { Server as SocketIOServer } from 'socket.io';
import { logger } from '../utils/logger';
import type { WebhookPayload } from '../types';
import { WhatsAppSession } from '../types';

export interface SessionEventData {
  sessionId: string;
  status: string;
  qrCode?: string;
  connectedNumber?: string;
  timestamp: string;
  metadata?: any;
}

/**
 * SocketService - Maneja comunicación en tiempo real para sesiones de WhatsApp
 *
 * Este servicio permite a los clientes del dashboard recibir actualizaciones
 * instantáneas cuando cambia el estado de las sesiones WhatsApp
 */
export class SocketService {
  private io: SocketIOServer;
  private connectedClients: Set<string> = new Set();

  constructor(httpServer: HTTPServer) {
    logger.info('🔌 Initializing Socket.IO server...');

    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.CORS_ORIGIN?.split(',') || [
          'http://localhost:3001', // Dashboard (Next.js)
          'http://localhost:3002', // WhatsApp service (self)
          'http://localhost:3003', // API server (NestJS)
        ],
        methods: ['GET', 'POST'],
        credentials: true,
      },
      // Namespace for WhatsApp session events
      path: '/whatsapp-socket/',
    });

    this.setupEventHandlers();

    logger.info('✅ Socket.IO server initialized successfully');
  }

  /**
   * Configure event handlers for socket connections
   */
  private setupEventHandlers(): void {
    // Main namespace for session events
    const whatsappNamespace = this.io.of('/whatsapp-sessions');

    whatsappNamespace.on('connection', (socket: Socket) => {
      const clientId = socket.id;
      this.connectedClients.add(clientId);

      logger.info(`🔌 Dashboard client connected to WhatsApp sessions namespace: ${clientId}`);
      logger.debug(`📊 Total connected clients: ${this.connectedClients.size}`);

      // Send current connection status
      socket.emit('connection:established', {
        clientId,
        timestamp: new Date().toISOString(),
        message: 'Connected to WhatsApp sessions real-time updates',
      });

      // Handle client requesting current sessions state
      socket.on('sessions:get_current_state', async () => {
        try {
          logger.debug(`📊 Client ${clientId} requested current sessions state`);

          // Import WhatsApp service to get current sessions (using unified facade)
          const WhatsAppServiceModule = await import('./WhatsAppService');
          const whatsappService = WhatsAppServiceModule.default;

          const sessions = await whatsappService.getAllSessions();

          socket.emit('sessions:current_state', {
            sessions: sessions.map(session => ({
              id: session.id,
              name: session.name || session.clientId,
              status: this.mapStatusToFrontend(session.status),
              phoneNumber: session.connectedNumber,
              qrCode: session.qrCode,
              lastActivity: session.lastSeen?.toISOString(),
              timestamp: new Date().toISOString(),
            })),
            timestamp: new Date().toISOString(),
          });
        } catch (error) {
          logger.error(`❌ Error getting current sessions state for client ${clientId}:`, error);
          socket.emit('error', {
            message: 'Failed to get current sessions state',
            timestamp: new Date().toISOString(),
          });
        }
      });

      // Handle ping/pong for connection health
      socket.on('ping', () => {
        socket.emit('pong', { timestamp: new Date().toISOString() });
      });

      // Handle disconnection
      socket.on('disconnect', reason => {
        this.connectedClients.delete(clientId);
        logger.info(
          `🔌 Dashboard client disconnected from WhatsApp sessions: ${clientId} (${reason})`
        );
        logger.debug(`📊 Remaining connected clients: ${this.connectedClients.size}`);
      });
    });

    logger.info('✅ Socket.IO event handlers configured');
  }

  /**
   * Map backend session status to frontend expected format
   */
  private mapStatusToFrontend(backendStatus: string): string {
    switch (backendStatus) {
      case 'ready':
      case 'authenticated':
        return 'CONNECTED';
      case 'connecting':
      case 'auth_failure':
        return 'CONNECTING';
      case 'disconnected':
        return 'DISCONNECTED';
      default:
        return 'QR_PENDING';
    }
  }

  /**
   * Emit session status change event to all connected clients
   */
  emitSessionStatusChange(sessionData: SessionEventData): void {
    if (this.connectedClients.size === 0) {
      logger.debug('📡 No clients connected, skipping session status broadcast');
      return;
    }

    const frontendStatus = this.mapStatusToFrontend(sessionData.status);

    const eventData = {
      sessionId: sessionData.sessionId,
      status: frontendStatus,
      phoneNumber: sessionData.connectedNumber,
      qrCode: sessionData.qrCode,
      timestamp: sessionData.timestamp,
      metadata: sessionData.metadata,
    };

    this.io.of('/whatsapp-sessions').emit('session:status_changed', eventData);

    logger.debug(`📡 Session status change broadcasted to ${this.connectedClients.size} clients:`, {
      sessionId: sessionData.sessionId,
      status: `${sessionData.status} → ${frontendStatus}`,
      connectedClients: this.connectedClients.size,
    });
  }

  /**
   * Emit QR code update event to all connected clients
   */
  emitQRCodeUpdate(sessionId: string, qrCode: string): void {
    if (this.connectedClients.size === 0) {
      logger.debug('📡 No clients connected, skipping QR code broadcast');
      return;
    }

    const eventData = {
      sessionId,
      qrCode,
      timestamp: new Date().toISOString(),
    };

    this.io.of('/whatsapp-sessions').emit('session:qr_updated', eventData);

    logger.debug(
      `📡 QR code update broadcasted to ${this.connectedClients.size} clients for session: ${sessionId}`
    );
  }

  /**
   * Emit session connected event to all connected clients
   */
  emitSessionConnected(sessionId: string, phoneNumber: string): void {
    if (this.connectedClients.size === 0) {
      logger.debug('📡 No clients connected, skipping session connected broadcast');
      return;
    }

    const eventData = {
      sessionId,
      status: 'CONNECTED',
      phoneNumber,
      timestamp: new Date().toISOString(),
    };

    this.io.of('/whatsapp-sessions').emit('session:connected', eventData);

    logger.info(`📡 Session connected broadcasted to ${this.connectedClients.size} clients:`, {
      sessionId,
      phoneNumber,
    });
  }

  /**
   * Emit session disconnected event to all connected clients
   */
  emitSessionDisconnected(sessionId: string, reason?: string): void {
    if (this.connectedClients.size === 0) {
      logger.debug('📡 No clients connected, skipping session disconnected broadcast');
      return;
    }

    const eventData = {
      sessionId,
      status: 'DISCONNECTED',
      reason,
      timestamp: new Date().toISOString(),
    };

    this.io.of('/whatsapp-sessions').emit('session:disconnected', eventData);

    logger.info(`📡 Session disconnected broadcasted to ${this.connectedClients.size} clients:`, {
      sessionId,
      reason,
    });
  }

  /**
   * Process webhook payload and emit appropriate socket events
   */
  processWebhookEvent(payload: WebhookPayload): void {
    logger.info(`📡 Processing webhook event: ${payload.event} for session ${payload.sessionId}`);

    switch (payload.event) {
      case 'qr_updated':
        logger.info(`📱 Emitting QR update for session ${payload.sessionId}`);
        this.emitQRCodeUpdate(payload.sessionId, payload.data.qrCode);
        break;

      case 'authenticated':
        logger.info(
          `✅ Emitting session connected for session ${payload.sessionId} with number ${payload.data.number}`
        );
        this.emitSessionConnected(payload.sessionId, payload.data.number);
        break;

      case 'disconnected':
        logger.info(`❌ Emitting session disconnected for session ${payload.sessionId}`);
        this.emitSessionDisconnected(payload.sessionId, payload.data.reason);
        break;

      case 'status_change':
        logger.info(
          `🔄 Emitting status change for session ${payload.sessionId}: ${payload.data.status}`
        );
        this.emitSessionStatusChange({
          sessionId: payload.sessionId,
          status: payload.data.status,
          timestamp: payload.timestamp,
          metadata: payload.data,
        });
        break;

      default:
        logger.debug(`🔄 Unhandled webhook event type: ${payload.event}`);
    }
  }

  /**
   * Get connection statistics
   */
  getStats() {
    return {
      connectedClients: this.connectedClients.size,
      namespaces: Object.keys(this.io._nsps || {}),
      uptime: process.uptime(),
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    logger.info('🔌 Shutting down Socket.IO server...');

    // Notify all clients about server shutdown
    this.io.of('/whatsapp-sessions').emit('server:shutdown', {
      message: 'Server is shutting down, reconnection will be attempted automatically',
      timestamp: new Date().toISOString(),
    });

    // Close all connections
    this.io.close(err => {
      if (err) {
        logger.error('❌ Error shutting down Socket.IO server:', err);
      } else {
        logger.info('✅ Socket.IO server shutdown completed');
      }
    });

    this.connectedClients.clear();
  }
}

// Singleton instance
let socketServiceInstance: SocketService | null = null;

export const initializeSocketService = (httpServer: HTTPServer): SocketService => {
  if (socketServiceInstance) {
    logger.warn('⚠️ SocketService already initialized, returning existing instance');
    return socketServiceInstance;
  }

  socketServiceInstance = new SocketService(httpServer);
  return socketServiceInstance;
};

export const getSocketService = (): SocketService | null => {
  return socketServiceInstance;
};

export default SocketService;
