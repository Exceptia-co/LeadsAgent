/**
 * @fileoverview Interface for WhatsApp session management
 * Used to break circular dependency between SocketService and WhatsAppService
 */

import type { WhatsAppSession } from '../types';

/**
 * Interface for WhatsApp session management operations
 * Used to break circular dependency between services
 */
export interface IWhatsAppSessionManager {
  /**
   * Get all active sessions
   */
  getAllSessions(): Promise<WhatsAppSession[]>;

  /**
   * Get a specific session by ID
   */
  getSession(sessionId: string): Promise<WhatsAppSession | null>;

  /**
   * Check if a session is connected and ready
   */
  isSessionReady(sessionId: string): boolean;

  /**
   * Get basic session status without full session data
   */
  getSessionStatus(sessionId: string): Promise<{
    id: string;
    status: string;
    connectedNumber?: string;
    lastSeen?: Date;
  } | null>;

  /**
   * Get WhatsApp client for session
   */
  getClient(sessionId: string): any;

  /**
   * Update session status and data
   */
  updateSessionStatus(sessionId: string, status: any, data?: any): Promise<void>;
}
