/**
 * @fileoverview Repository pattern types and interfaces
 * Phase 2 of WhatsApp service refactoring - Database layer modularization
 */

// Re-export types from DatabaseService for compatibility
export interface ConversationData {
  sessionId: string;
  phoneNumber: string;
  contactName?: string;
  messageText?: string;
  responseText?: string;
  messageType?: string;
  intent?: string;
  sentiment?: string;
  aiProvider?: string;
  tokensUsed?: number;
  isFromUser?: boolean;
}

export interface ConversationHistory {
  id: string;
  sessionId: string;
  phoneNumber: string;
  contactName?: string;
  messageText?: string;
  responseText?: string;
  messageType: string;
  intent?: string;
  sentiment?: string;
  aiProvider?: string;
  tokensUsed: number;
  isFromUser: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Lead {
  id: string;
  name?: string;
  phone: string;
  email?: string;
  tags?: string[];
  status: 'NUEVO' | 'CONTACTADO' | 'QUALIFIED' | 'PERDIDO' | 'GANADO';
  moodScore?: number;
  lastContact?: Date;
  assignedTo?: string;
  source: string;
  whatsappAuthorized?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface KnowledgeBaseEntry {
  id: string;
  category: string;
  question: string;
  answer: string;
  priority: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface WhitelistLogEntry {
  id: string;
  phoneNumber: string;
  sessionId: string;
  decision: 'ALLOWED' | 'BLOCKED';
  reason: string;
  timestamp: Date;
}

export interface TrainingInteraction {
  id: string;
  sessionId: string;
  phoneNumber: string;
  originalQuery: string;
  aiResponse: string;
  userFeedback: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  improvementSuggestion?: string;
  createdAt: Date;
}

export interface AIConfiguration {
  key: string;
  value: string;
  description?: string;
  updatedAt: Date;
}

// Base repository interface
export interface IBaseRepository {
  /**
   * Initialize the repository (setup database connections, run migrations if needed)
   */
  initialize(): Promise<void>;

  /**
   * Test database connection
   */
  testConnection(): Promise<boolean>;

  /**
   * Close database connections
   */
  close(): Promise<void>;
}

// Repository factory interface for dependency injection
export interface IRepositoryFactory {
  createLeadRepository(): ILeadRepository;
  createConversationRepository(): IConversationRepository;
  createKnowledgeBaseRepository(): IKnowledgeBaseRepository;
  createAIConfigRepository(): IAIConfigRepository;
  createWhitelistLogRepository(): IWhitelistLogRepository;
  createTrainingRepository(): ITrainingRepository;
}

// Domain-specific repository interfaces
export interface ILeadRepository extends IBaseRepository {
  findAll(): Promise<Lead[]>;
  findById(id: string): Promise<Lead | null>;
  findByPhone(phone: string): Promise<Lead | null>;
  create(leadData: Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>): Promise<Lead>;
  updateWhatsAppAuth(phone: string, authorized: boolean): Promise<boolean>;
  update(id: string, data: Partial<Lead>): Promise<Lead | null>;
  delete(id: string): Promise<boolean>;
}

export interface IConversationRepository extends IBaseRepository {
  save(data: ConversationData): Promise<void>;
  findById(id: string): Promise<ConversationHistory | null>;
  findBySessionId(sessionId: string, limit?: number): Promise<ConversationHistory[]>;
  findByPhoneNumber(phoneNumber: string, limit?: number): Promise<ConversationHistory[]>;
  getHistory(sessionId: string, limit?: number): Promise<ConversationHistory[]>;
  getRecentContext(sessionId: string, messageCount?: number): Promise<string>;
  search(query: string, limit?: number): Promise<ConversationHistory[]>;
  getMessages(conversationId: string, limit?: number): Promise<ConversationHistory[]>;
  createOrUpdate(data: ConversationData): Promise<ConversationHistory>;
  getStats(sessionId?: string): Promise<any>;
}

export interface IKnowledgeBaseRepository extends IBaseRepository {
  findAll(category?: string): Promise<KnowledgeBaseEntry[]>;
  findById(id: string): Promise<KnowledgeBaseEntry | null>;
  search(query: string): Promise<KnowledgeBaseEntry[]>;
  create(
    entry: Omit<KnowledgeBaseEntry, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<KnowledgeBaseEntry>;
  update(id: string, data: Partial<KnowledgeBaseEntry>): Promise<KnowledgeBaseEntry | null>;
  delete(id: string): Promise<boolean>;
  clear(): Promise<boolean>;
  getStats(): Promise<{
    total: number;
    byCategory: Record<string, number>;
    active: number;
    inactive: number;
  }>;
}

export interface IAIConfigRepository extends IBaseRepository {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, description?: string): Promise<void>;
  getAll(): Promise<AIConfiguration[]>;
  delete(key: string): Promise<boolean>;
}

export interface IWhitelistLogRepository extends IBaseRepository {
  log(data: Omit<WhitelistLogEntry, 'id' | 'timestamp'>): Promise<void>;
  findByPhoneNumber(phoneNumber: string, limit?: number): Promise<WhitelistLogEntry[]>;
  findBySessionId(sessionId: string, limit?: number): Promise<WhitelistLogEntry[]>;
  getStats(hours?: number): Promise<{
    total: number;
    allowed: number;
    blocked: number;
    byReason: Record<string, number>;
  }>;
  cleanup(olderThanDays: number): Promise<number>;
}

export interface ITrainingRepository extends IBaseRepository {
  save(interaction: Omit<TrainingInteraction, 'id' | 'createdAt'>): Promise<TrainingInteraction>;
  findBySessionId(sessionId: string, limit?: number): Promise<TrainingInteraction[]>;
  findByPhoneNumber(phoneNumber: string, limit?: number): Promise<TrainingInteraction[]>;
  search(query: string, limit?: number): Promise<TrainingInteraction[]>;
  getStats(): Promise<{
    total: number;
    positive: number;
    negative: number;
    neutral: number;
    last30Days: number;
  }>;
  cleanup(olderThanDays: number): Promise<number>;
}

// Database connection manager interface
export interface IDatabaseConnection {
  query(sql: string, params?: any[]): Promise<any>;
  testConnection(): Promise<boolean>;
  close(): Promise<void>;
}
