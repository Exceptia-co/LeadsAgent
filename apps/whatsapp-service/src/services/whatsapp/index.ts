/**
 * @fileoverview Export all WhatsApp service components
 * Part of WhatsAppServiceSimple refactoring following SRP
 */

export { SessionManager } from './SessionManager';
export { ConnectionManager } from './ConnectionManager';
export { MessageProcessor } from './MessageProcessor';
export { EventHandler } from './EventHandler';
export { MediaHandler } from './MediaHandler';
export { ContactManager } from './ContactManager';

// Re-export types for convenience
export type {
  ISessionManager,
  IConnectionManager,
  IMessageProcessor,
  IEventHandler,
  IMediaHandler,
  IContactManager,
  SessionStatus,
  WhatsAppMessage,
  SendMessageRequest,
  SendMessageResponse,
  SendMediaMessageRequest,
  MediaMetadata,
  MediaProcessingOptions,
  WhatsAppContact,
  ContactInfo,
  ChatInfo,
} from '../../types';
