// ================================
// Core Domain Types
// ================================

export interface WhatsAppMessage {
  id: string;
  from: string;
  to: string;
  body: string;
  timestamp: number;
  type: 'text' | 'image' | 'audio' | 'video' | 'document';
  mediaUrl?: string;
  isGroup: boolean;
  fromMe: boolean;
}

export interface WhatsAppContact {
  id: string;
  phoneNumber: string;
  name: string | null;
  formattedName?: string | null;
  shortName?: string | null;
  pushName?: string | null;
  profilePicUrl: string | null;
  isMe: boolean;
  isUser: boolean;
  isGroup: boolean;
  isWAContact: boolean;
  isBusiness: boolean;
  labels: string[];
}

export interface WhatsAppSession {
  id: string;
  clientId: string;
  status: SessionStatus;
  qrCode?: string;
  lastSeen: Date;
  webhookUrl?: string;
  name?: string;
  connectedNumber?: string;
  phoneNumber?: string;
  createdAt?: Date;
  updatedAt?: Date;
  metadata?: Record<string, any>;
  clientInfo?: any;
}

export type SessionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'authenticated'
  | 'auth_failure'
  | 'auth_failed'
  | 'ready'
  | 'waiting_qr';

export interface WebhookPayload {
  event:
    | 'message'
    | 'status_change'
    | 'qr_updated'
    | 'authenticated'
    | 'disconnected'
    | 'webhook_test';
  sessionId: string;
  data: any;
  timestamp: string;
}

export interface SendMessageRequest {
  to: string;
  message: string;
  sessionId?: string;
}

export interface SendMessageResponse {
  success: boolean;
  messageId?: string;
  error?: string;
  timestamp?: Date;
}

export interface WhatsAppConfig {
  sessionPath: string;
  webhookUrl?: string;
  apiBaseUrl: string;
  redis: {
    url: string;
    prefix: string;
  };
}

// ================================
// Service Layer Interfaces
// ================================

/**
 * Message Processing
 */
export interface IMessageProcessor {
  sendMessage(sessionId: string, request: SendMessageRequest): Promise<SendMessageResponse>;
  processIncomingMessage(sessionId: string, message: WhatsAppMessage): Promise<void>;
  sendMediaMessage(
    sessionId: string,
    request: SendMediaMessageRequest
  ): Promise<SendMessageResponse>;
  convertWhatsAppMessage(sessionId: string, message: any): WhatsAppMessage;
  getMessageStats(sessionId: string): any;
}

/**
 * Event Handling
 */
export interface IEventHandler {
  onQrCode(sessionId: string, qr: string): Promise<void>;
  onAuthenticated(sessionId: string, clientInfo: any): Promise<void>;
  onReady(sessionId: string, clientInfo: any): Promise<void>;
  onDisconnected(sessionId: string, reason: string): Promise<void>;
  onMessage(sessionId: string, message: WhatsAppMessage): Promise<void>;
}

/**
 * Connection Management
 */
export interface IConnectionManager {
  connect(sessionId: string): Promise<void>;
  disconnect(sessionId: string): Promise<void>;
  reconnect(sessionId: string, maxAttempts?: number): Promise<void>;
  isConnected(sessionId: string): boolean;
  getConnectionHealth(sessionId: string): Promise<ConnectionHealth>;
  createConnection(sessionId: string, options?: any): Promise<any>; // Returns WhatsApp Web Client
  initializeConnection(sessionId: string): Promise<void>;
  destroyConnection(sessionId: string): Promise<void>;
  getConnectionMetrics(sessionId: string): any;
}

export interface ConnectionHealth {
  isHealthy: boolean;
  lastPingTime: Date;
  responseTime: number;
  errorCount: number;
  uptime: number;
}

/**
 * Media Handling
 */
export interface IMediaHandler {
  downloadMedia(sessionId: string, messageId: string): Promise<MediaDownloadResult>;
  sendMediaMessage(
    sessionId: string,
    request: SendMediaMessageRequest
  ): Promise<SendMessageResponse>;
  getMediaInfo(sessionId: string, messageId: string): Promise<MediaInfo | null>;
  deleteMedia(sessionId: string, mediaPath: string): Promise<void>;
}

export interface MediaDownloadResult {
  success: boolean;
  filePath?: string;
  mimeType?: string;
  fileSize?: number;
  error?: string;
}

export interface MediaInfo {
  messageId: string;
  mediaType: string;
  mimeType: string;
  fileSize: number;
  fileName?: string;
  caption?: string;
}

export interface MediaMetadata {
  messageId: string;
  sessionId: string;
  mediaType: string;
  type: 'image' | 'audio' | 'video' | 'document';
  mimeType: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  caption?: string;
  thumbnail?: string;
  downloadedAt: Date | null;
}

export interface MediaProcessingOptions {
  saveToFile?: boolean;
  filePath?: string;
  maxFileSize?: number;
  allowedMimeTypes?: string[];
  generateThumbnail?: boolean;
  quality?: number;
  filename?: string;
  resize?: { width: number; height: number };
  compress?: boolean | number;
}

/**
 * Contact Management
 */
export interface IContactManager {
  getContact(sessionId: string, phoneNumber: string): Promise<WhatsAppContact | null>;
  getAllContacts(sessionId: string): Promise<WhatsAppContact[]>;
  searchContacts(sessionId: string, query: string): Promise<WhatsAppContact[]>;
  blockContact(sessionId: string, phoneNumber: string): Promise<boolean>;
  unblockContact(sessionId: string, phoneNumber: string): Promise<boolean>;
  getContactInfo(sessionId: string, phoneNumber: string): Promise<ContactInfo | null>;
  getChatInfo(sessionId: string, chatId: string): Promise<ChatInfo | null>;
  syncContacts(sessionId: string): Promise<void>;
}

export interface ContactInfo {
  id: string;
  name?: string;
  phoneNumber: string;
  profilePicture?: string;
  status?: string;
  isBlocked: boolean;
  isBusiness: boolean;
  verifiedName?: string;
}

export interface ChatInfo {
  id: string;
  name: string;
  isGroup: boolean;
  isReadOnly?: boolean;
  participants?: ContactInfo[];
  description?: string;
  profilePicUrl?: string;
  profilePicture?: string;
  isArchived?: boolean;
  archived?: boolean;
  isMuted?: boolean;
  muted?: boolean;
  pinned?: boolean;
  unreadCount: number;
  timestamp?: number;
  lastMessage?: {
    body: string;
    timestamp: Date;
    fromMe: boolean;
  };
  groupInfo?: {
    description: string | null;
    owner: string | null;
    creation: number;
    participants: Array<{
      id: string;
      isAdmin: boolean;
      isSuperAdmin: boolean;
    }>;
    inviteCode: string | null;
  };
  contactInfo?: WhatsAppContact;
}

// ================================
// Repository Interfaces
// ================================

export interface ISessionRepository {
  create(session: CreateSessionDTO): Promise<WhatsAppSession>;
  findById(sessionId: string): Promise<WhatsAppSession | null>;
  findAll(): Promise<WhatsAppSession[]>;
  update(sessionId: string, updates: Partial<WhatsAppSession>): Promise<WhatsAppSession>;
  delete(sessionId: string): Promise<void>;
  findByStatus(status: SessionStatus): Promise<WhatsAppSession[]>;
}

export interface IMessageRepository {
  save(message: SaveMessageDTO): Promise<WhatsAppMessage>;
  findBySessionId(sessionId: string, limit?: number, offset?: number): Promise<WhatsAppMessage[]>;
  findById(messageId: string): Promise<WhatsAppMessage | null>;
  delete(messageId: string): Promise<void>;
  findByDateRange(sessionId: string, startDate: Date, endDate: Date): Promise<WhatsAppMessage[]>;
}

export interface IContactRepository {
  save(contact: SaveContactDTO): Promise<WhatsAppContact>;
  findBySessionId(sessionId: string): Promise<WhatsAppContact[]>;
  findByNumber(number: string): Promise<WhatsAppContact | null>;
  update(contactId: string, updates: Partial<WhatsAppContact>): Promise<WhatsAppContact>;
  delete(contactId: string): Promise<void>;
}

// ================================
// AI Provider Interfaces
// ================================

export interface IAIProvider {
  readonly name: string;
  readonly isAvailable: boolean;

  generateResponse(prompt: string, context?: AIContext): Promise<AIResponse>;
  classifyMessage(message: string, categories: string[]): Promise<Classification>;
  extractEntities(text: string): Promise<EntityExtraction>;
  isHealthy(): Promise<boolean>;
}

export interface AIContext {
  sessionId: string;
  conversationHistory?: WhatsAppMessage[];
  userContext?: Record<string, any>;
  systemPrompt?: string;
}

export interface AIResponse {
  text: string;
  confidence: number;
  model: string;
  tokensUsed: number;
  processingTime: number;
  metadata?: Record<string, any>;
}

export interface Classification {
  category: string;
  confidence: number;
  alternatives: Array<{ category: string; confidence: number }>;
}

export interface EntityExtraction {
  entities: Array<{
    type: string;
    value: string;
    confidence: number;
    start: number;
    end: number;
  }>;
}

// ================================
// Cache Layer Interface
// ================================

export interface ICacheRepository {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  expire(key: string, ttlSeconds: number): Promise<void>;
  keys(pattern: string): Promise<string[]>;
  flush(): Promise<void>;
}

// ================================
// Event System Interfaces
// ================================

export interface IEventBus {
  subscribe(eventName: string, handler: EventHandler<any>): void;
  unsubscribe(eventName: string, handler: EventHandler<any>): void;
  publish(eventName: string, data: any): Promise<void>;
  once(eventName: string, handler: EventHandler<any>): void;
  addMiddleware?(middleware: any): void;
  removeMiddleware?(middleware: any): void;
  getStats?(): any;
  clear?(): void;
}

export type EventHandler<T = any> = (data: T) => Promise<void> | void;

export interface DomainEvent {
  id: string;
  type: string;
  aggregateId: string;
  timestamp: Date;
  version: number;
  data: Record<string, any>;
}

// ================================
// DTOs (Data Transfer Objects)
// ================================

export interface CreateSessionDTO {
  sessionId: string;
  name?: string;
  webhookUrl?: string;
  metadata?: Record<string, any>;
}

export interface SaveMessageDTO {
  id: string;
  sessionId: string;
  from: string;
  to: string;
  body: string;
  timestamp: number;
  type: WhatsAppMessage['type'];
  mediaUrl?: string;
  isGroup: boolean;
  fromMe: boolean;
}

export interface SaveContactDTO {
  id: string;
  sessionId: string;
  name: string;
  number: string;
  profilePic?: string;
  isBlocked?: boolean;
}

export interface SendMediaMessageRequest {
  to: string;
  mediaPath: string;
  mediaType: 'image' | 'audio' | 'video' | 'document';
  caption?: string;
  filename?: string;
}

// ================================
// Common Utility Types
// ================================

export type Result<T, E = Error> = { success: true; data: T } | { success: false; error: E };

// Type guard for Result type
export function isSuccess<T, E>(result: Result<T, E>): result is { success: true; data: T } {
  return result.success === true;
}

export function isFailure<T, E>(result: Result<T, E>): result is { success: false; error: E } {
  return result.success === false;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface QueryOptions {
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  filters?: Record<string, any>;
}

// ================================
// AI Learning and Training Types
// ================================

export interface TrainingInteraction {
  id?: string;
  userMessage: string;
  aiResponse: string;
  knowledgeBaseIdsUsed: string[];
  successScore: number;
  contextData: {
    phoneNumber: string;
    sessionId: string;
    leadId?: string;
    intent?: string;
    sentiment?: string;
    responseTime?: number;
    conversationLength?: number;
    userEngagement?: string;
    timeOfDay?: string;
    dayOfWeek?: string;
    responseType?: string;
  };
  feedbackMetrics: {
    conversationContinued: boolean;
    responseTime?: number;
    followUpQuestions: number;
    userSatisfactionIndicators: string[];
    personalizedElements?: number;
    contextFactors?: number;
  };
  timestamp: Date;
}

export interface FrequentPattern {
  pattern: string;
  frequency: number;
  averageSuccessScore: number;
  suggestedKnowledgeEntry?: {
    title: string;
    content: string;
    keywords: string[];
    category: string;
  };
  lastSeen: Date;
}

export interface LearningInsights {
  totalInteractions: number;
  averageSuccessScore: number;
  mostFrequentPatterns: FrequentPattern[];
  suggestedKnowledgeEntries: Array<{
    title: string;
    content: string;
    keywords: string[];
    category: string;
    confidence: number;
    frequency: number;
  }>;
  performanceMetrics: {
    responseAccuracy: number;
    userSatisfaction: number;
    knowledgeBaseUtilization: number;
    conversationCompletionRate: number;
  };
}

// ================================
// Configuration Types
// ================================

export interface DatabaseConfig {
  url: string;
  maxConnections: number;
  connectionTimeout: number;
  retryAttempts: number;
}

export interface RedisConfig {
  url: string;
  maxRetries: number;
  retryDelayOnFailover: number;
  keyPrefix: string;
}

export interface AIConfig {
  providers: {
    openrouter?: {
      apiKey: string;
      baseURL: string;
      model: string;
    };
    gemini?: {
      apiKey: string;
      model: string;
    };
  };
  defaultProvider: string;
  timeout: number;
  maxTokens: number;
}

// ================================
// Service Interfaces
// ================================

/**
 * Main WhatsApp Service interface
 */
export interface IWhatsAppService {
  initialize(): Promise<void>;
  createSession(sessionId: string): Promise<WhatsAppSession>;
  sendMessage(sessionId: string, to: string, message: string): Promise<SendMessageResponse>;
  sendMediaMessage(
    sessionId: string,
    request: SendMediaMessageRequest
  ): Promise<SendMessageResponse>;
  getSessionStatus(sessionId: string): Promise<WhatsAppSession | null>;
  getAllSessions(): Promise<WhatsAppSession[]>;
  destroySession(sessionId: string): Promise<void>;
  getHealthStatus(): any;
  shutdown(): Promise<void>;
}

// ================================
// Additional Types and Interfaces
// ================================

/**
 * EnrichedContext for AI operations
 */
export interface EnrichedContext {
  sessionId: string;
  contactName?: string;
  phoneNumber?: string;
  conversationHistory?: WhatsAppMessage[];
  userContext?: Record<string, any>;
  metadata?: Record<string, any>;
}

/**
 * SessionPersistenceData for session storage
 */
export interface SessionPersistenceData {
  id: string;
  status: SessionStatus;
  qrCode?: string;
  lastSeen: Date;
  webhookUrl?: string;
  name?: string;
  connectedNumber?: string;
  phoneNumber?: string;
  createdAt: Date;
  updatedAt: Date;
  autoReconnect?: boolean;
  lastHealthCheck?: Date;
  metadata?: Record<string, any>;
}

/**
 * Event types for WhatsApp events
 */
export interface SessionReady {
  sessionId: string;
  phoneNumber: string;
  clientInfo: any;
  timestamp: Date;
}

export interface SessionAuthenticated {
  sessionId: string;
  phoneNumber: string;
  clientInfo: any;
  timestamp: Date;
}

/**
 * Conversation types for enhanced services
 */
export interface Conversation {
  id: string;
  telefono: string;
  mensaje: string;
  tipo: 'incoming' | 'outgoing';
  timestamp: Date;
}

export interface ConversationData {
  sessionId: string;
  phoneNumber: string;
  message: string;
  type: 'incoming' | 'outgoing';
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface ConversationHistory {
  id: string;
  sessionId: string;
  phoneNumber: string;
  message: string;
  type: 'incoming' | 'outgoing';
  timestamp: Date;
  metadata?: Record<string, any>;
}
