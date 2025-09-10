import { Pool, PoolClient } from 'pg';
import { logger } from '../utils/logger';
import PhoneNumberService from './PhoneNumberService';
import type { TrainingInteraction } from '../types';
import MigrationService from './MigrationService';
import { RepositoryFactory, ILeadRepository, IConversationRepository } from './db';
import { KnowledgeBaseRepository } from './db/KnowledgeBaseRepository';
import { AIConfigRepository } from './db/AIConfigRepository';
import { TrainingRepository } from './db/TrainingRepository';
import { WhitelistLogRepository } from './db/WhitelistLogRepository';

// Re-export types for backward compatibility (will be removed after full migration)
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

/**
 * Database Service Facade
 *
 * Phase 2 of refactoring plan: Acts as a facade that delegates to either:
 * - Legacy implementation (direct SQL) when USE_DATABASE_REPOSITORIES=false
 * - Repository pattern when USE_DATABASE_REPOSITORIES=true
 *
 * This maintains full API compatibility while allowing gradual migration.
 */
class DatabaseService {
  private pool: Pool | null = null;
  private useRepositories: boolean;
  private repositoryFactory: RepositoryFactory | null = null;
  private leadRepository: ILeadRepository | null = null;
  private conversationRepository: IConversationRepository | null = null;
  private knowledgeBaseRepository: KnowledgeBaseRepository | null = null;
  private aiConfigRepository: AIConfigRepository | null = null;
  private trainingRepository: TrainingRepository | null = null;
  private whitelistLogRepository: WhitelistLogRepository | null = null;

  constructor() {
    // Feature toggle: USE_DATABASE_REPOSITORIES environment variable
    this.useRepositories = process.env.USE_DATABASE_REPOSITORIES === 'true';

    logger.info(
      `🗄️ Database Service Architecture: ${this.useRepositories ? 'REPOSITORIES (v2.0)' : 'LEGACY (v1.0)'}`
    );

    this.initializePool();

    // Note: Repository initialization is async and will be called during initializeTable()
  }

  private initializePool(): void {
    try {
      if (!process.env.DATABASE_URL) {
        logger.warn(
          'DATABASE_URL no está configurado, funcionando sin persistencia de base de datos'
        );
        return;
      }

      this.pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });

      this.pool.on('error', err => {
        logger.error('Error en el pool de conexiones PostgreSQL:', err);
      });

      logger.info('Pool de conexiones PostgreSQL inicializado');
    } catch (error) {
      logger.error('Error inicializando pool de base de datos:', error);
    }
  }

  // Método público para reinicializar la conexión (útil para tests)
  public reinitializeConnection(): void {
    if (this.pool) {
      this.pool.end();
    }
    this.initializePool();
  }

  // Initialize repository pattern (Phase 2 feature)
  private async initializeRepositories(): Promise<void> {
    if (!this.pool) {
      logger.warn('Cannot initialize repositories without database pool');
      return;
    }

    try {
      logger.info('🏭 Initializing repository pattern...');

      this.repositoryFactory = new RepositoryFactory(this.pool);
      await this.repositoryFactory.initialize();

      // Create repository instances
      this.leadRepository = this.repositoryFactory.createLeadRepository();
      this.conversationRepository = this.repositoryFactory.createConversationRepository();
      this.knowledgeBaseRepository = this.repositoryFactory.createKnowledgeBaseRepository();
      this.aiConfigRepository = this.repositoryFactory.createAIConfigRepository();
      this.trainingRepository = this.repositoryFactory.createTrainingRepository();
      this.whitelistLogRepository = this.repositoryFactory.createWhitelistLogRepository();

      // Initialize repositories
      await this.repositoryFactory.initializeAllRepositories();

      logger.info('✅ Repository pattern initialized successfully');
    } catch (error) {
      logger.error('❌ Failed to initialize repositories:', error);
      // Fallback to legacy mode
      this.useRepositories = false;
      logger.warn('🔄 Falling back to legacy database implementation');
    }
  }

  // Ejecutar migraciones automáticamente
  private async runMigrations(): Promise<void> {
    if (!this.pool) {
      logger.warn('No hay conexión a base de datos disponible para migraciones');
      return;
    }

    try {
      const migrationService = new MigrationService(this.pool);
      await migrationService.runMigrations();
      logger.info('✅ Migraciones ejecutadas correctamente');
    } catch (error) {
      logger.error('❌ Error ejecutando migraciones:', error);
      throw error; // Re-throw para que falle la inicialización si hay problemas críticos
    }
  }

  // Crear tabla si no existe
  public async initializeTable(): Promise<void> {
    if (!this.pool) {
      logger.warn('No hay conexión a base de datos disponible');
      return;
    }

    // Initialize repositories if using repository pattern
    if (this.useRepositories && !this.repositoryFactory) {
      await this.initializeRepositories();
    }

    // Ejecutar migraciones automáticamente
    await this.runMigrations();

    const createTablesQuery = `
      -- Tabla de conversaciones de WhatsApp
      CREATE TABLE IF NOT EXISTS whatsapp_conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id VARCHAR(255) NOT NULL,
        phone_number VARCHAR(50) NOT NULL,
        contact_name VARCHAR(255),
        message_text TEXT,
        response_text TEXT,
        message_type VARCHAR(50) DEFAULT 'text',
        intent VARCHAR(100),
        sentiment VARCHAR(50),
        ai_provider VARCHAR(50),
        tokens_used INTEGER DEFAULT 0,
        is_from_user BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Tabla de logs de decisiones de whitelist
      CREATE TABLE IF NOT EXISTS whatsapp_whitelist_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        phone_number VARCHAR(50) NOT NULL,
        session_id VARCHAR(255),
        decision VARCHAR(20) NOT NULL CHECK (decision IN ('ALLOWED', 'BLOCKED')),
        reason TEXT,
        lead_id VARCHAR(255),
        lead_name VARCHAR(255),
        message_preview TEXT,
        ai_provider VARCHAR(50),
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Índices para consultas frecuentes
      CREATE INDEX IF NOT EXISTS idx_whatsapp_phone ON whatsapp_conversations(phone_number);
      CREATE INDEX IF NOT EXISTS idx_whatsapp_session ON whatsapp_conversations(session_id);
      CREATE INDEX IF NOT EXISTS idx_whatsapp_created ON whatsapp_conversations(created_at);
      
      CREATE INDEX IF NOT EXISTS idx_whitelist_logs_phone ON whatsapp_whitelist_logs(phone_number);
      CREATE INDEX IF NOT EXISTS idx_whitelist_logs_decision ON whatsapp_whitelist_logs(decision);
      CREATE INDEX IF NOT EXISTS idx_whitelist_logs_created ON whatsapp_whitelist_logs(created_at);
      CREATE INDEX IF NOT EXISTS idx_whitelist_logs_session ON whatsapp_whitelist_logs(session_id);

      -- Tabla de knowledge base para entrenamiento IA
      CREATE TABLE IF NOT EXISTS ai_knowledge_base (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        category VARCHAR(100) NOT NULL,
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        keywords TEXT[], -- Array of keywords for search
        priority INTEGER DEFAULT 1, -- Higher priority = more important
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Tabla de configuración IA (system prompts, etc.)
      CREATE TABLE IF NOT EXISTS ai_configuration (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        config_key VARCHAR(100) UNIQUE NOT NULL,
        config_value TEXT NOT NULL,
        description TEXT,
        updated_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Índices para knowledge base
      CREATE INDEX IF NOT EXISTS idx_knowledge_category ON ai_knowledge_base(category);
      CREATE INDEX IF NOT EXISTS idx_knowledge_active ON ai_knowledge_base(is_active);
      CREATE INDEX IF NOT EXISTS idx_knowledge_priority ON ai_knowledge_base(priority DESC);
      CREATE INDEX IF NOT EXISTS idx_ai_config_key ON ai_configuration(config_key);

      -- Tabla de templates de mensajes
      CREATE TABLE IF NOT EXISTS message_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        category VARCHAR(100) NOT NULL,
        subject VARCHAR(255),
        content TEXT NOT NULL,
        variables JSON DEFAULT '[]', -- Array de variables disponibles
        is_active BOOLEAN DEFAULT true,
        created_by VARCHAR(255),
        usage_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Tabla de mensajes proactivos enviados
      CREATE TABLE IF NOT EXISTS proactive_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        lead_id VARCHAR(255) NOT NULL,
        template_id UUID,
        session_id VARCHAR(255),
        phone_number VARCHAR(50) NOT NULL,
        content TEXT NOT NULL,
        status VARCHAR(50) DEFAULT 'pending', -- pending, sent, delivered, failed
        sent_at TIMESTAMP,
        delivered_at TIMESTAMP,
        error_message TEXT,
        created_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Índices para templates
      CREATE INDEX IF NOT EXISTS idx_templates_category ON message_templates(category);
      CREATE INDEX IF NOT EXISTS idx_templates_active ON message_templates(is_active);
      CREATE INDEX IF NOT EXISTS idx_templates_usage ON message_templates(usage_count DESC);
      
      -- Índices para mensajes proactivos
      CREATE INDEX IF NOT EXISTS idx_proactive_lead ON proactive_messages(lead_id);
      CREATE INDEX IF NOT EXISTS idx_proactive_status ON proactive_messages(status);
      CREATE INDEX IF NOT EXISTS idx_proactive_created ON proactive_messages(created_at);
      CREATE INDEX IF NOT EXISTS idx_proactive_phone ON proactive_messages(phone_number);

      -- Tabla de interacciones de entrenamiento IA
      CREATE TABLE IF NOT EXISTS ai_training_interactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_message TEXT NOT NULL,
        ai_response TEXT NOT NULL,
        knowledge_base_ids_used TEXT[] DEFAULT '{}', -- Array de IDs utilizados
        success_score DECIMAL(3,2) DEFAULT 0.50 CHECK (success_score >= 0 AND success_score <= 1),
        context_data JSONB NOT NULL, -- Información contextual (phoneNumber, sessionId, etc.)
        feedback_metrics JSONB NOT NULL, -- Métricas de feedback (continuación, tiempo, etc.)
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Índices para training interactions
      CREATE INDEX IF NOT EXISTS idx_training_score ON ai_training_interactions(success_score);
      CREATE INDEX IF NOT EXISTS idx_training_created ON ai_training_interactions(created_at);
      CREATE INDEX IF NOT EXISTS idx_training_context_phone ON ai_training_interactions((context_data->>'phoneNumber'));
      CREATE INDEX IF NOT EXISTS idx_training_user_message ON ai_training_interactions USING gin(to_tsvector('spanish', user_message));
      CREATE INDEX IF NOT EXISTS idx_training_kb_used ON ai_training_interactions USING gin(knowledge_base_ids_used);
    `;

    try {
      await this.pool.query(createTablesQuery);
      logger.info(
        'Tablas whatsapp_conversations y whatsapp_whitelist_logs verificadas/creadas correctamente'
      );
    } catch (error) {
      logger.error('Error creando tablas:', error);
    }
  }

  // Guardar conversación
  public async saveConversation(data: ConversationData): Promise<string | null> {
    // Phase 2: Repository pattern delegation
    if (this.useRepositories && this.conversationRepository) {
      try {
        logger.debug('🏛️ Using ConversationRepository for saveConversation');
        await this.conversationRepository.save(data);
        // Return a placeholder ID since the repository pattern doesn't return the ID
        return 'repo-generated-id';
      } catch (error) {
        logger.error('❌ Repository method failed, falling back to legacy:', error);
        // Fallback to legacy implementation below
      }
    }

    // Legacy implementation
    // LOG DETALLADO: Estado inicial
    logger.info('🔍 [DIAGNOSTIC] saveConversation called with data:', {
      sessionId: data.sessionId,
      phoneNumber: data.phoneNumber,
      messageText: data.messageText ? data.messageText.substring(0, 50) + '...' : null,
      responseText: data.responseText ? data.responseText.substring(0, 50) + '...' : null,
      isFromUser: data.isFromUser,
    });

    // LOG DETALLADO: Estado de la conexión
    if (!this.pool) {
      logger.error('❌ [DIAGNOSTIC] No database connection available!');
      logger.error('❌ [DIAGNOSTIC] DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'NOT SET');
      return null;
    }

    logger.info('✅ [DIAGNOSTIC] Database pool connection available');

    const query = `
      INSERT INTO whatsapp_conversations (
        session_id, phone_number, contact_name, message_text, response_text,
        intent, sentiment, ai_provider, tokens_used, is_from_user
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id;
    `;

    const values = [
      data.sessionId,
      data.phoneNumber,
      data.contactName || null,
      data.messageText || null,
      data.responseText || null,
      data.intent || null,
      data.sentiment || null,
      data.aiProvider || null,
      data.tokensUsed || 0,
      data.isFromUser !== undefined ? data.isFromUser : true,
    ];

    // LOG DETALLADO: Valores que se van a insertar
    logger.info('📝 [DIAGNOSTIC] Query values prepared:', {
      sessionId: values[0],
      phoneNumber: values[1],
      contactName: values[2],
      intent: values[5],
      isFromUser: values[9],
    });

    try {
      logger.info('🔄 [DIAGNOSTIC] Executing database query...');
      const result = await this.pool.query(query, values);

      const conversationId = result.rows[0]?.id;

      logger.info('✅ [DIAGNOSTIC] Query executed successfully!', {
        conversationId,
        rowsAffected: result.rowCount,
        returningId: result.rows[0]?.id,
      });

      logger.info('💾 Conversación guardada correctamente:', {
        id: conversationId,
        phoneNumber: data.phoneNumber,
        sessionId: data.sessionId,
      });

      return conversationId;
    } catch (error: any) {
      logger.error('❌ [DIAGNOSTIC] Error executing database query:', {
        error: error.message,
        code: error.code,
        detail: error.detail,
        hint: error.hint,
        position: error.position,
        stack: error.stack?.substring(0, 200) + '...',
      });
      logger.error('❌ Error guardando conversación (legacy):', error);
      return null;
    }
  }

  // Obtener historial de conversación por número de teléfono
  public async getConversationHistory(
    phoneNumber: string,
    limit: number = 50
  ): Promise<ConversationHistory[]> {
    if (!this.pool) {
      logger.warn('No hay conexión a base de datos');
      return [];
    }

    const query = `
      SELECT * FROM whatsapp_conversations 
      WHERE phone_number = $1 
      ORDER BY created_at DESC 
      LIMIT $2;
    `;

    try {
      const result = await this.pool.query(query, [phoneNumber, limit]);
      return result.rows.map(row => ({
        id: row.id,
        sessionId: row.session_id,
        phoneNumber: row.phone_number,
        contactName: row.contact_name,
        messageText: row.message_text,
        responseText: row.response_text,
        messageType: row.message_type,
        intent: row.intent,
        sentiment: row.sentiment,
        aiProvider: row.ai_provider,
        tokensUsed: row.tokens_used || 0,
        isFromUser: row.is_from_user,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      }));
    } catch (error) {
      logger.error('Error obteniendo historial de conversación:', error);
      return [];
    }
  }

  // Obtener historial reciente para contexto de IA (últimos N mensajes)
  public async getRecentContext(
    phoneNumber: string,
    sessionId: string,
    limit: number = 10
  ): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
    if (!this.pool) {
      return [];
    }

    const query = `
      SELECT message_text, response_text, is_from_user, created_at
      FROM whatsapp_conversations 
      WHERE phone_number = $1 AND session_id = $2
      ORDER BY created_at ASC 
      LIMIT $3;
    `;

    try {
      const result = await this.pool.query(query, [phoneNumber, sessionId, limit]);
      const context: Array<{ role: 'user' | 'assistant'; content: string }> = [];

      result.rows.forEach(row => {
        if (row.message_text && row.is_from_user) {
          context.push({
            role: 'user',
            content: row.message_text,
          });
        }
        if (row.response_text && !row.is_from_user) {
          context.push({
            role: 'assistant',
            content: row.response_text,
          });
        }
      });

      return context;
    } catch (error) {
      logger.error('Error obteniendo contexto reciente:', error);
      return [];
    }
  }

  // Obtener estadísticas de conversaciones
  public async getStats(sessionId?: string): Promise<any> {
    if (!this.pool) {
      return {
        totalConversations: 0,
        uniqueContacts: 0,
        averageResponseTime: 0,
      };
    }

    let query = `
      SELECT 
        COUNT(*) as total_conversations,
        COUNT(DISTINCT phone_number) as unique_contacts,
        COUNT(CASE WHEN ai_provider IS NOT NULL THEN 1 END) as ai_responses
      FROM whatsapp_conversations
    `;

    const values: any[] = [];
    if (sessionId) {
      query += ' WHERE session_id = $1';
      values.push(sessionId);
    }

    try {
      const result = await this.pool.query(query, values);
      const stats = result.rows[0];

      return {
        totalConversations: parseInt(stats.total_conversations) || 0,
        uniqueContacts: parseInt(stats.unique_contacts) || 0,
        aiResponses: parseInt(stats.ai_responses) || 0,
        averageTokens: 0, // tokens_used functionality not implemented yet
      };
    } catch (error) {
      logger.error('Error obteniendo estadísticas:', error);
      return {
        totalConversations: 0,
        uniqueContacts: 0,
        aiResponses: 0,
        averageTokens: 0,
      };
    }
  }

  // Buscar conversaciones por términos
  public async searchConversations(
    searchTerm: string,
    sessionId?: string,
    limit: number = 20
  ): Promise<ConversationHistory[]> {
    if (!this.pool) {
      return [];
    }

    let query = `
      SELECT * FROM whatsapp_conversations 
      WHERE (message_text ILIKE $1 OR response_text ILIKE $1 OR contact_name ILIKE $1)
    `;

    const values: any[] = [`%${searchTerm}%`];

    if (sessionId) {
      query += ' AND session_id = $2';
      values.push(sessionId);
      query += ' ORDER BY created_at DESC LIMIT $3';
      values.push(limit);
    } else {
      query += ' ORDER BY created_at DESC LIMIT $2';
      values.push(limit);
    }

    try {
      const result = await this.pool.query(query, values);
      return result.rows.map(row => ({
        id: row.id,
        sessionId: row.session_id,
        phoneNumber: row.phone_number,
        contactName: row.contact_name,
        messageText: row.message_text,
        responseText: row.response_text,
        messageType: row.message_type,
        intent: row.intent,
        sentiment: row.sentiment,
        aiProvider: row.ai_provider,
        tokensUsed: row.tokens_used || 0,
        isFromUser: row.is_from_user,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      }));
    } catch (error) {
      logger.error('Error buscando conversaciones:', error);
      return [];
    }
  }

  // Cerrar conexiones de la base de datos
  public async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      logger.info('Pool de conexiones PostgreSQL cerrado');
    }
  }

  // Verificar conexión a la base de datos
  public async testConnection(): Promise<boolean> {
    if (!this.pool) {
      return false;
    }

    try {
      const result = await this.pool.query('SELECT NOW()');
      logger.info('Conexión a base de datos verificada:', result.rows[0]);
      return true;
    } catch (error) {
      logger.error('Error verificando conexión a base de datos:', error);
      return false;
    }
  }

  // Obtener todos los leads (con fallback a datos mockeados)
  public async getAllLeads(): Promise<Lead[]> {
    // Phase 2: Repository pattern delegation
    if (this.useRepositories && this.leadRepository) {
      try {
        logger.debug('🏛️ Using LeadRepository for getAllLeads');
        return await this.leadRepository.findAll();
      } catch (error) {
        logger.error('❌ Repository method failed, falling back to legacy:', error);
        // Fallback to legacy implementation below
      }
    }

    // Legacy implementation
    // Intentar obtener leads de la base de datos real
    if (this.pool) {
      try {
        // Verificar si existe la tabla de leads
        const checkTableQuery = `
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'leads'
          );
        `;

        const tableExists = await this.pool.query(checkTableQuery);

        if (tableExists.rows[0].exists) {
          // La tabla existe, obtener leads reales con estructura de Supabase
          const query = `
            SELECT 
              id, name, phone, email, tags, status, mood_score, 
              last_contact, assigned_to, source, whatsapp_authorized,
              created_at, updated_at
            FROM leads 
            ORDER BY created_at DESC;
          `;

          const result = await this.pool.query(query);
          const realLeads = result.rows.map(row => ({
            id: row.id,
            name: row.name,
            phone: row.phone,
            email: row.email,
            tags: row.tags,
            status: row.status,
            moodScore: row.mood_score,
            lastContact: row.last_contact ? new Date(row.last_contact) : undefined,
            assignedTo: row.assigned_to,
            source: row.source,
            whatsappAuthorized: row.whatsapp_authorized,
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at),
          }));

          logger.info(`✅ Obtenidos ${realLeads.length} leads de la base de datos`);
          return realLeads;
        }
      } catch (error) {
        logger.warn('Error obteniendo leads de la base de datos, usando datos mockeados:', error);
      }
    }

    // Fallback: devolver leads mockeados para desarrollo
    const mockLeads: Lead[] = [
      {
        id: '1',
        name: 'Juan Pérez',
        phone: '+5491123456789',
        email: 'juan@example.com',
        tags: ['interesado', 'productos'],
        status: 'NUEVO',
        moodScore: 8.5,
        source: 'website',
        whatsappAuthorized: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: '2',
        name: 'María García',
        phone: '+5491187654321',
        email: 'maria@example.com',
        tags: ['información', 'precios'],
        status: 'QUALIFIED',
        moodScore: 9.2,
        source: 'referral',
        whatsappAuthorized: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: '3',
        name: 'Carlos López',
        phone: '+5491155443322',
        email: 'carlos@example.com',
        tags: ['automatización', 'urgente'],
        status: 'NUEVO',
        moodScore: 7.8,
        source: 'social_media',
        whatsappAuthorized: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: '4',
        name: 'Ana Martínez',
        phone: '+5491166778899',
        email: 'ana@example.com',
        tags: ['chatbots', 'negocio'],
        status: 'GANADO',
        moodScore: 9.5,
        source: 'website',
        whatsappAuthorized: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    logger.info(`🔧 Usando ${mockLeads.length} leads mockeados para desarrollo`);
    return mockLeads;
  }

  // Check if a lead with similar phone number already exists
  public async findLeadByPhone(phoneNumber: string): Promise<Lead | null> {
    if (!this.pool) {
      return null;
    }

    try {
      // Get all leads to check for duplicates
      const allLeads = await this.getAllLeads();

      // Use PhoneNumberService to find equivalent phone numbers
      for (const lead of allLeads) {
        if (lead.phone && PhoneNumberService.arePhoneNumbersEquivalent(phoneNumber, lead.phone)) {
          logger.info(
            `📞 Found existing lead with equivalent phone number: ${lead.phone} ≈ ${phoneNumber}`
          );
          return lead;
        }
      }

      return null;
    } catch (error) {
      logger.error('Error searching for lead by phone:', error);
      return null;
    }
  }

  // Find lead by ID
  public async findLeadById(leadId: string): Promise<Lead | null> {
    if (!this.pool) {
      return null;
    }

    try {
      // Check if the table exists first
      const checkTableQuery = `
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'leads'
        );
      `;

      const tableExists = await this.pool.query(checkTableQuery);

      if (tableExists.rows[0].exists) {
        const query = `
          SELECT 
            id, name, phone, email, tags, status, mood_score, 
            last_contact, assigned_to, source, whatsapp_authorized,
            created_at, updated_at
          FROM leads 
          WHERE id = $1;
        `;

        const result = await this.pool.query(query, [leadId]);

        if (result.rows.length > 0) {
          const row = result.rows[0];
          return {
            id: row.id,
            name: row.name,
            phone: row.phone,
            email: row.email,
            tags: row.tags,
            status: row.status,
            moodScore: row.mood_score,
            lastContact: row.last_contact ? new Date(row.last_contact) : undefined,
            assignedTo: row.assigned_to,
            source: row.source,
            whatsappAuthorized: row.whatsapp_authorized,
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at),
          };
        }
      }

      return null;
    } catch (error) {
      logger.error('Error finding lead by ID:', error);
      return null;
    }
  }

  // Create a new lead
  public async createLead(leadData: {
    name?: string | null;
    email?: string | null;
    phone: string;
    status?: 'NUEVO' | 'CONTACTADO' | 'QUALIFIED' | 'GANADO' | 'PERDIDO';
    source?: string;
  }): Promise<Lead | null> {
    if (!this.pool) {
      logger.warn('No database connection available, cannot create lead');
      return null;
    }

    try {
      // Normalize the phone number before processing
      const normalizedPhone = PhoneNumberService.normalizePhoneNumber(leadData.phone);

      // Check if a lead with this phone number already exists
      const existingLead = await this.findLeadByPhone(normalizedPhone);
      if (existingLead) {
        logger.warn(
          `⚠️ Lead with phone number ${leadData.phone} (normalized: ${normalizedPhone}) already exists with ID: ${existingLead.id}`
        );
        throw new Error(
          `Duplicate phone number: A lead with phone ${leadData.phone} already exists`
        );
      }
      // Check if leads table exists
      const checkTableQuery = `
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'leads'
        );
      `;

      const tableExists = await this.pool.query(checkTableQuery);

      if (!tableExists.rows[0].exists) {
        logger.error('Leads table does not exist');
        return null;
      }

      // Insert new lead using Supabase schema column names
      const query = `
        INSERT INTO leads (
          name, email, phone, status, source, whatsapp_authorized, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING 
          id, name, email, phone, status, source, whatsapp_authorized, 
          mood_score, last_contact, assigned_to, created_at, updated_at;
      `;

      const values = [
        leadData.name || null,
        leadData.email || null,
        normalizedPhone, // Use normalized phone number
        leadData.status || 'NUEVO',
        leadData.source || 'manual',
        true, // Default to WhatsApp authorized
      ];

      const result = await this.pool.query(query, values);

      if (result.rows.length > 0) {
        const row = result.rows[0];
        const newLead: Lead = {
          id: row.id,
          name: row.name,
          email: row.email,
          phone: row.phone,
          status: row.status,
          source: row.source,
          tags: [],
          whatsappAuthorized: row.whatsapp_authorized,
          moodScore: row.mood_score ? parseFloat(row.mood_score) : undefined,
          lastContact: row.last_contact ? new Date(row.last_contact) : undefined,
          assignedTo: row.assigned_to,
          createdAt: new Date(row.created_at),
          updatedAt: new Date(row.updated_at),
        };

        logger.info(`✅ Created new lead: ${newLead.name || 'Unnamed'} (${newLead.phone})`);
        return newLead;
      }

      logger.error('Failed to create lead - no rows returned');
      return null;
    } catch (error: any) {
      logger.error('Error creating lead:', error);

      // Re-throw the error so the caller can handle it (e.g., for duplicate phone detection)
      throw error;
    }
  }

  // Update lead WhatsApp authorization status
  public async updateLeadWhatsAppAuth(
    leadId: string,
    whatsappAuthorized: boolean
  ): Promise<boolean> {
    if (this.pool) {
      try {
        const query = `
          UPDATE leads 
          SET "whatsappAuthorized" = $1, "updatedAt" = CURRENT_TIMESTAMP
          WHERE id = $2
          RETURNING id;
        `;

        const result = await this.pool.query(query, [whatsappAuthorized, leadId]);

        if (result.rows.length > 0) {
          logger.info(`✅ Lead ${leadId} WhatsApp authorization updated to: ${whatsappAuthorized}`);
          return true;
        } else {
          logger.warn(`⚠️ Lead ${leadId} not found for WhatsApp authorization update`);
          return false;
        }
      } catch (error) {
        logger.error('Error updating lead WhatsApp authorization:', error);
        return false;
      }
    }

    // For mock data, we can't actually update, so just log and return true
    logger.info(
      `🔧 Mock update: Lead ${leadId} WhatsApp authorization would be set to: ${whatsappAuthorized}`
    );
    return true;
  }

  // Get recent conversations across all phone numbers
  public async getRecentConversations(
    sessionId?: string,
    limit: number = 50
  ): Promise<ConversationHistory[]> {
    if (!this.pool) {
      logger.warn('No hay conexión a base de datos');
      return [];
    }

    let query = `
      SELECT * FROM whatsapp_conversations
    `;

    const values: any[] = [];

    if (sessionId) {
      query += ' WHERE session_id = $1';
      values.push(sessionId);
      query += ' ORDER BY created_at DESC LIMIT $2';
      values.push(limit);
    } else {
      query += ' ORDER BY created_at DESC LIMIT $1';
      values.push(limit);
    }

    try {
      const result = await this.pool.query(query, values);
      return result.rows.map(row => ({
        id: row.id,
        sessionId: row.session_id,
        phoneNumber: row.phone_number,
        contactName: row.contact_name,
        messageText: row.message_text,
        responseText: row.response_text,
        messageType: row.message_type,
        intent: row.intent,
        sentiment: row.sentiment,
        aiProvider: row.ai_provider,
        tokensUsed: row.tokens_used || 0,
        isFromUser: row.is_from_user,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      }));
    } catch (error) {
      logger.error('Error obteniendo conversaciones recientes:', error);
      return [];
    }
  }

  // Registrar decisión de whitelist en logs
  public async logWhitelistDecision(data: {
    phoneNumber: string;
    sessionId?: string;
    decision: 'ALLOWED' | 'BLOCKED';
    reason?: string;
    leadId?: string;
    leadName?: string;
    messagePreview?: string;
    aiProvider?: string;
    ipAddress?: string;
    userAgent?: string;
    createdBy?: string;
  }): Promise<string | null> {
    // Phase 2c: Delegate to repository if enabled
    if (this.useRepositories && this.whitelistLogRepository) {
      try {
        logger.debug('🔄 Using WhitelistLogRepository');
        return await this.whitelistLogRepository.logWhitelistDecision(data);
      } catch (error) {
        logger.warn('❌ Repository method failed, falling back to legacy:', error);
        // Fallback to legacy implementation below
      }
    }

    // Legacy implementation
    if (!this.pool) {
      logger.warn('No hay conexión a base de datos, log de whitelist no guardado');
      return null;
    }

    // ✅ FIXED: Use 'decision' field (NOT 'action') and ensure NOT NULL
    const query = `
      INSERT INTO whatsapp_whitelist_logs (
        phone_number, session_id, decision, reason, lead_id, lead_name,
        message_preview, ai_provider, ip_address, user_agent, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id;
    `;

    const values = [
      data.phoneNumber,
      data.sessionId || null,
      data.decision, // ✅ This will never be null - REQUIRED field
      data.reason || null,
      data.leadId || null,
      data.leadName || null,
      data.messagePreview ? data.messagePreview.substring(0, 200) : null, // Limit preview length
      data.aiProvider || null,
      data.ipAddress || null,
      data.userAgent || null,
      data.createdBy || 'whatsapp-service',
    ];

    try {
      const result = await this.pool.query(query, values);
      const logId = result.rows[0]?.id;

      logger.debug('Whitelist decision logged:', {
        id: logId,
        phoneNumber: data.phoneNumber,
        decision: data.decision, // ✅ Now using correct field
      });

      return logId;
    } catch (error) {
      logger.error('Error logging whitelist decision:', error);
      logger.error('Failed query values:', {
        phoneNumber: data.phoneNumber,
        decision: data.decision,
        hasNullDecision: data.decision === null || data.decision === undefined,
      });
      return null;
    }
  }

  // Obtener logs de whitelist con filtros
  public async getWhitelistLogs(
    options: {
      limit?: number;
      offset?: number;
      phoneNumber?: string;
      sessionId?: string;
      decision?: 'ALLOWED' | 'BLOCKED';
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<any[]> {
    // Phase 2c: Delegate to repository if enabled
    if (this.useRepositories && this.whitelistLogRepository) {
      try {
        logger.debug('🔄 Using WhitelistLogRepository');
        return await this.whitelistLogRepository.getWhitelistLogs(options);
      } catch (error) {
        logger.warn('❌ Repository method failed, falling back to legacy:', error);
        // Fallback to legacy implementation below
      }
    }

    // Legacy implementation
    if (!this.pool) {
      return [];
    }

    const {
      limit = 50,
      offset = 0,
      phoneNumber,
      sessionId,
      decision,
      startDate,
      endDate,
    } = options;

    let query = `
      SELECT 
        id, phone_number, session_id, decision, reason, created_by, created_at
      FROM whatsapp_whitelist_logs
      WHERE 1=1
    `;

    const values: any[] = [];
    let valueIndex = 1;

    if (phoneNumber) {
      query += ` AND phone_number = $${valueIndex++}`;
      values.push(phoneNumber);
    }

    if (sessionId) {
      query += ` AND session_id = $${valueIndex++}`;
      values.push(sessionId);
    }

    if (decision) {
      query += ` AND decision = $${valueIndex++}`;
      values.push(decision);
    }

    if (startDate) {
      query += ` AND created_at >= $${valueIndex++}`;
      values.push(startDate);
    }

    if (endDate) {
      query += ` AND created_at <= $${valueIndex++}`;
      values.push(endDate);
    }

    query += ` ORDER BY created_at DESC LIMIT $${valueIndex++} OFFSET $${valueIndex++}`;
    values.push(limit, offset);

    try {
      const result = await this.pool.query(query, values);
      return result.rows.map(row => ({
        id: row.id,
        phoneNumber: row.phone_number,
        sessionId: row.session_id,
        decision: row.decision,
        reason: row.reason,
        createdBy: row.created_by,
        createdAt: new Date(row.created_at),
      }));
    } catch (error) {
      logger.error('Error getting whitelist logs:', error);
      return [];
    }
  }

  // Obtener estadísticas de whitelist
  public async getWhitelistStats(
    options: {
      sessionId?: string;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<any> {
    if (!this.pool) {
      return {
        totalDecisions: 0,
        allowedCount: 0,
        blockedCount: 0,
        allowedPercentage: 0,
        blockedPercentage: 0,
        uniquePhones: 0,
      };
    }

    const { sessionId, startDate, endDate } = options;

    let query = `
      SELECT 
        COUNT(*) as total_decisions,
        COUNT(CASE WHEN decision = 'ALLOWED' THEN 1 END) as allowed_count,
        COUNT(CASE WHEN decision = 'BLOCKED' THEN 1 END) as blocked_count,
        COUNT(DISTINCT phone_number) as unique_phones
      FROM whatsapp_whitelist_logs
      WHERE 1=1
    `;

    const values: any[] = [];
    let valueIndex = 1;

    if (sessionId) {
      query += ` AND session_id = $${valueIndex++}`;
      values.push(sessionId);
    }

    if (startDate) {
      query += ` AND created_at >= $${valueIndex++}`;
      values.push(startDate);
    }

    if (endDate) {
      query += ` AND created_at <= $${valueIndex++}`;
      values.push(endDate);
    }

    try {
      const result = await this.pool.query(query, values);
      const stats = result.rows[0];

      const totalDecisions = parseInt(stats.total_decisions) || 0;
      const allowedCount = parseInt(stats.allowed_count) || 0;
      const blockedCount = parseInt(stats.blocked_count) || 0;

      return {
        totalDecisions,
        allowedCount,
        blockedCount,
        allowedPercentage:
          totalDecisions > 0 ? ((allowedCount / totalDecisions) * 100).toFixed(1) : '0',
        blockedPercentage:
          totalDecisions > 0 ? ((blockedCount / totalDecisions) * 100).toFixed(1) : '0',
        uniquePhones: parseInt(stats.unique_phones) || 0,
      };
    } catch (error) {
      logger.error('Error getting whitelist statistics:', error);
      return {
        totalDecisions: 0,
        allowedCount: 0,
        blockedCount: 0,
        allowedPercentage: '0',
        blockedPercentage: '0',
        uniquePhones: 0,
      };
    }
  }

  // ============================================
  // NUEVOS MÉTODOS PARA CONVERSACIONES
  // ============================================

  // Obtener conversaciones estructuradas con información de leads
  public async getConversations(limit: number = 50, offset: number = 0): Promise<any[]> {
    if (!this.pool) {
      logger.warn('No hay conexión a base de datos para obtener conversaciones');
      return this.getMockConversations(limit, offset);
    }

    try {
      // Obtener conversaciones agrupadas por número de teléfono con el último mensaje
      const query = `
        WITH latest_messages AS (
          SELECT DISTINCT ON (phone_number) 
            phone_number,
            session_id,
            contact_name,
            COALESCE(message_text, response_text) as last_message_content,
            message_type,
            is_from_user,
            created_at,
            updated_at
          FROM whatsapp_conversations 
          ORDER BY phone_number, created_at DESC
        ),
        unread_counts AS (
          SELECT 
            phone_number,
            COUNT(*) as unread_count
          FROM whatsapp_conversations 
          WHERE is_from_user = true
          GROUP BY phone_number
        )
        SELECT 
          lm.*,
          COALESCE(uc.unread_count, 0) as unread_count
        FROM latest_messages lm
        LEFT JOIN unread_counts uc ON lm.phone_number = uc.phone_number
        ORDER BY lm.created_at DESC
        LIMIT $1 OFFSET $2;
      `;

      const result = await this.pool.query(query, [limit, offset]);
      const leads = await this.getAllLeads();

      // Mapear conversaciones con información de leads
      const conversations = result.rows.map(row => {
        // Buscar lead correspondiente
        const lead = leads.find(l => {
          if (!l.phone) return false;
          const leadPhone = l.phone.replace(/[^0-9]/g, '');
          const conversationPhone = row.phone_number.replace(/[^0-9]/g, '');
          return leadPhone.slice(-10) === conversationPhone.slice(-10);
        });

        return {
          id: `conv_${row.phone_number}`, // ID único para la conversación
          leadId: lead?.id || null,
          lead: lead || {
            id: 'unknown',
            name: row.contact_name || 'Desconocido',
            phone: row.phone_number,
            status: 'NUEVO',
          },
          lastMessage: {
            id: `msg_${Date.now()}`,
            content: row.last_message_content || '',
            direction: row.is_from_user ? 'INBOUND' : 'OUTBOUND',
            messageType: row.message_type || 'text',
            status: 'delivered',
            createdAt: row.created_at,
          },
          unreadCount: parseInt(row.unread_count) || 0,
          updatedAt: row.updated_at,
        };
      });

      logger.info(`✅ Obtenidas ${conversations.length} conversaciones de la base de datos`);
      return conversations;
    } catch (error) {
      logger.error('Error obteniendo conversaciones:', error);
      return this.getMockConversations(limit, offset);
    }
  }

  // Obtener conversación específica por ID
  public async getConversationById(conversationId: string): Promise<any | null> {
    try {
      // Extraer número de teléfono del ID de conversación
      const phoneNumber = conversationId.replace('conv_', '');
      const leads = await this.getAllLeads();

      // Buscar lead correspondiente
      const lead = leads.find(l => {
        if (!l.phone) return false;
        const leadPhone = l.phone.replace(/[^0-9]/g, '');
        const conversationPhone = phoneNumber.replace(/[^0-9]/g, '');
        return leadPhone.slice(-10) === conversationPhone.slice(-10);
      });

      if (!lead) {
        return null;
      }

      return {
        id: conversationId,
        leadId: lead.id,
        lead: lead,
      };
    } catch (error) {
      logger.error('Error obteniendo conversación por ID:', error);
      return null;
    }
  }

  // Obtener mensajes de una conversación con paginación
  public async getConversationMessages(
    conversationId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<{ conversation: any; messages?: any[] }> {
    try {
      // Extraer número de teléfono del ID de conversación
      const phoneNumber = conversationId.replace('conv_', '');

      // Obtener información de la conversación
      const conversation = await this.getConversationById(conversationId);
      if (!conversation) {
        return { conversation: null };
      }

      if (!this.pool) {
        return {
          conversation: {
            id: conversationId,
            lead: conversation.lead,
            messages: this.getMockMessages(phoneNumber, limit),
          },
        };
      }

      // Obtener mensajes de la base de datos
      const query = `
        SELECT 
          id, session_id, phone_number, contact_name,
          message_text, response_text, message_type,
          is_from_user, created_at, updated_at
        FROM whatsapp_conversations 
        WHERE phone_number = $1 
        ORDER BY created_at ASC
        LIMIT $2 OFFSET $3;
      `;

      const result = await this.pool.query(query, [phoneNumber, limit, offset]);

      // Convertir mensajes al formato esperado
      const messages = result.rows.map(row => ({
        id: row.id,
        content: row.message_text || row.response_text || '',
        direction: row.is_from_user ? 'INBOUND' : 'OUTBOUND',
        messageType: row.message_type || 'text',
        status: 'delivered',
        createdAt: row.created_at,
      }));

      return {
        conversation: {
          id: conversationId,
          lead: conversation.lead,
          messages: messages,
        },
      };
    } catch (error) {
      logger.error('Error obteniendo mensajes de conversación:', error);
      return { conversation: null };
    }
  }

  // Crear o actualizar conversación
  public async createOrUpdateConversation(
    leadId: string,
    sessionId: string
  ): Promise<string | null> {
    try {
      const leads = await this.getAllLeads();
      const lead = leads.find(l => l.id === leadId);

      if (!lead || !lead.phone) {
        logger.warn(`Lead ${leadId} no encontrado o sin teléfono`);
        return null;
      }

      // Crear ID de conversación basado en el número de teléfono
      const conversationId = `conv_${lead.phone.replace(/[^0-9]/g, '')}`;

      logger.info(`Conversación ${conversationId} creada/actualizada para lead ${leadId}`);
      return conversationId;
    } catch (error) {
      logger.error('Error creando/actualizando conversación:', error);
      return null;
    }
  }

  // Datos mockeados para desarrollo
  private getMockConversations(limit: number, offset: number): any[] {
    const mockConversations = [
      {
        id: 'conv_5491123456789',
        leadId: '1',
        lead: {
          id: '1',
          name: 'Juan Pérez',
          phone: '+5491123456789',
          status: 'NUEVO',
        },
        lastMessage: {
          id: 'msg_1',
          content: '¡Hola! Me interesa conocer más sobre sus servicios',
          direction: 'INBOUND',
          messageType: 'text',
          status: 'delivered',
          createdAt: new Date().toISOString(),
        },
        unreadCount: 2,
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'conv_5491187654321',
        leadId: '2',
        lead: {
          id: '2',
          name: 'María García',
          phone: '+5491187654321',
          status: 'QUALIFIED',
        },
        lastMessage: {
          id: 'msg_2',
          content: 'Perfecto, gracias por la información. ¿Cuándo podemos agendar una reunión?',
          direction: 'INBOUND',
          messageType: 'text',
          status: 'delivered',
          createdAt: new Date(Date.now() - 3600000).toISOString(),
        },
        unreadCount: 0,
        updatedAt: new Date(Date.now() - 3600000).toISOString(),
      },
    ];

    return mockConversations.slice(offset, offset + limit);
  }

  private getMockMessages(phoneNumber: string, limit: number): any[] {
    const mockMessages = [
      {
        id: 'msg_1',
        content: '¡Hola! Me interesa conocer más sobre sus servicios',
        direction: 'INBOUND',
        messageType: 'text',
        status: 'delivered',
        createdAt: new Date(Date.now() - 7200000).toISOString(),
      },
      {
        id: 'msg_2',
        content:
          '¡Hola! 👋 Gracias por contactarnos. Soy tu asistente virtual y estoy aquí para ayudarte. ¿En qué puedo asistirte hoy?',
        direction: 'OUTBOUND',
        messageType: 'text',
        status: 'delivered',
        createdAt: new Date(Date.now() - 7190000).toISOString(),
      },
      {
        id: 'msg_3',
        content: '¿Podrían enviarme información sobre precios?',
        direction: 'INBOUND',
        messageType: 'text',
        status: 'delivered',
        createdAt: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        id: 'msg_4',
        content:
          'Te ayudo con información sobre precios. 💰\n\n¿Podrías decirme qué producto o servicio específico te interesa? Así podremos darte la información más precisa.',
        direction: 'OUTBOUND',
        messageType: 'text',
        status: 'delivered',
        createdAt: new Date(Date.now() - 3590000).toISOString(),
      },
    ];

    return mockMessages.slice(0, limit);
  }

  // ============================================
  // KNOWLEDGE BASE Y CONFIGURACIÓN IA
  // ============================================

  // Obtener knowledge base para contexto IA
  public async getKnowledgeBase(category?: string): Promise<any[]> {
    // Phase 2: Delegate to repository if enabled
    if (this.useRepositories && this.knowledgeBaseRepository) {
      try {
        logger.debug('🔄 Using KnowledgeBaseRepository');
        return await this.knowledgeBaseRepository.getKnowledgeBase(category);
      } catch (error) {
        logger.warn('❌ Repository method failed, falling back to legacy:', error);
        // Fallback to legacy implementation below
      }
    }

    // Legacy implementation
    if (!this.pool) {
      return this.getDefaultKnowledgeBase();
    }

    try {
      let query = `
        SELECT id, category, title, content, keywords, priority
        FROM ai_knowledge_base 
        WHERE is_active = true
      `;

      const values: any[] = [];

      if (category) {
        query += ` AND category = $1`;
        values.push(category);
      }

      query += ` ORDER BY priority DESC, created_at ASC`;

      const result = await this.pool.query(query, values);
      return result.rows;
    } catch (error) {
      logger.error('Error obteniendo knowledge base:', error);
      return this.getDefaultKnowledgeBase();
    }
  }

  // Obtener configuración IA
  public async getAIConfiguration(key: string): Promise<string | null> {
    // Phase 2: Delegate to repository if enabled
    if (this.useRepositories && this.aiConfigRepository) {
      try {
        logger.debug('🔄 Using AIConfigRepository');
        const result = await this.aiConfigRepository.getAIConfiguration(key);
        return result || this.getDefaultConfig(key);
      } catch (error) {
        logger.warn('❌ Repository method failed, falling back to legacy:', error);
        // Fallback to legacy implementation below
      }
    }

    // Legacy implementation
    if (!this.pool) {
      return this.getDefaultConfig(key);
    }

    try {
      const query = `
        SELECT config_value 
        FROM ai_configuration 
        WHERE config_key = $1
      `;

      const result = await this.pool.query(query, [key]);
      return result.rows[0]?.config_value || this.getDefaultConfig(key);
    } catch (error) {
      logger.error('Error obteniendo configuración IA:', error);
      return this.getDefaultConfig(key);
    }
  }

  // Actualizar configuración IA
  public async updateAIConfiguration(
    key: string,
    value: string,
    updatedBy?: string
  ): Promise<boolean> {
    // Phase 2: Delegate to repository if enabled
    if (this.useRepositories && this.aiConfigRepository) {
      try {
        logger.debug('🔄 Using AIConfigRepository');
        return await this.aiConfigRepository.updateAIConfiguration(key, value, updatedBy);
      } catch (error) {
        logger.warn('❌ Repository method failed, falling back to legacy:', error);
        // Fallback to legacy implementation below
      }
    }

    // Legacy implementation
    if (!this.pool) {
      logger.info(`Mock update: ${key} = ${value.substring(0, 100)}...`);
      return true;
    }

    try {
      const query = `
        INSERT INTO ai_configuration (config_key, config_value, updated_by, updated_at)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        ON CONFLICT (config_key) 
        DO UPDATE SET 
          config_value = EXCLUDED.config_value,
          updated_by = EXCLUDED.updated_by,
          updated_at = CURRENT_TIMESTAMP
      `;

      await this.pool.query(query, [key, value, updatedBy]);
      logger.info(`✅ Configuración IA actualizada: ${key}`);
      return true;
    } catch (error) {
      logger.error('Error actualizando configuración IA:', error);
      return false;
    }
  }

  // Buscar en knowledge base por keywords con scoring inteligente
  public async searchKnowledgeBase(query: string): Promise<any[]> {
    // Phase 2: Delegate to repository if enabled
    if (this.useRepositories && this.knowledgeBaseRepository) {
      try {
        logger.debug('🔄 Using KnowledgeBaseRepository');
        return await this.knowledgeBaseRepository.searchKnowledgeBase(query);
      } catch (error) {
        logger.warn('❌ Repository method failed, falling back to legacy:', error);
        // Fallback to legacy implementation below
      }
    }

    // Legacy implementation
    if (!this.pool) {
      return this.getDefaultKnowledgeBase()
        .filter(
          item =>
            item.content.toLowerCase().includes(query.toLowerCase()) ||
            item.title.toLowerCase().includes(query.toLowerCase())
        )
        .slice(0, 3); // Limitar resultados
    }

    try {
      // Extraer palabras clave del query para mejor matching
      const queryWords = this.extractSearchKeywords(query);
      const searchTerms = [`%${query}%`, ...queryWords.map(word => `%${word}%`)];

      const searchQuery = `
        SELECT 
          id, category, title, content, keywords, priority,
          -- Calcular relevancia score
          (
            -- Puntuación por match exacto en título (peso: 100)
            CASE WHEN title ILIKE $1 THEN 100 ELSE 0 END +
            -- Puntuación por keywords coincidentes (peso: 80)
            (
              SELECT COUNT(*) * 80 
              FROM unnest(keywords) AS keyword 
              WHERE keyword ILIKE ANY($2::text[])
            ) +
            -- Puntuación por match en contenido (peso: 30)
            CASE WHEN content ILIKE $1 THEN 30 ELSE 0 END +
            -- Bonificación por prioridad (peso: prioridad * 5)
            (priority * 5)
          ) AS relevance_score
        FROM ai_knowledge_base 
        WHERE is_active = true
          AND (
            title ILIKE $1 OR 
            content ILIKE $1 OR
            EXISTS (
              SELECT 1 FROM unnest(keywords) AS keyword 
              WHERE keyword ILIKE ANY($2::text[])
            )
          )
        ORDER BY relevance_score DESC, priority DESC
        LIMIT 3;
      `;

      const result = await this.pool.query(searchQuery, [query, searchTerms]);

      // Agregar score calculado y filtrar por relevancia mínima
      return result.rows
        .filter(row => row.relevance_score >= 30) // Filtro de relevancia mínima
        .map(row => ({
          ...row,
          relevance_score: row.relevance_score,
          match_quality: this.calculateMatchQuality(row.relevance_score),
        }));
    } catch (error) {
      logger.error('Error buscando en knowledge base:', error);
      return [];
    }
  }

  // Extraer palabras clave de una consulta
  private extractSearchKeywords(query: string): string[] {
    // Palabras comunes en español que no aportan valor semántico
    const stopWords = [
      'el',
      'la',
      'de',
      'que',
      'y',
      'en',
      'un',
      'es',
      'se',
      'no',
      'te',
      'lo',
      'le',
      'da',
      'su',
      'por',
      'son',
      'con',
      'para',
      'como',
      'del',
      'las',
    ];

    return query
      .toLowerCase()
      .replace(/[^\w\sáéíóúñü]/gi, '') // Remover puntuación pero mantener acentos
      .split(/\s+/)
      .filter(word => word.length >= 3 && !stopWords.includes(word))
      .slice(0, 5); // Máximo 5 palabras clave
  }

  // Calcular calidad del match
  private calculateMatchQuality(score: number): 'high' | 'medium' | 'low' {
    if (score >= 100) return 'high';
    if (score >= 60) return 'medium';
    return 'low';
  }

  // Knowledge base por defecto con información completa de EscortsHub
  private getDefaultKnowledgeBase(): any[] {
    return [
      {
        id: 'default_1',
        category: 'productos',
        title: 'Productos Disponibles EscortsHub',
        content: `**CATÁLOGO COMPLETO DE PRODUCTOS ESCORTSHUB:**\n\n🔥 **1. ANUNCIO DOBLE**\n• Descripción: Anuncio con visibilidad aumentada que ocupa doble espacio\n• Beneficios: Mayor visibilidad en los listados, destaca entre anuncios regulares\n• Base: 11 monedas HUB\n• Precios: 1 día (20 HUB), 5 días (85 HUB), 10 días (150 HUB)\n• Ideal para: Escorts que buscan destacar entre los anuncios regulares\n\n⭐ **2. ANUNCIO TOP**\n• Descripción: Anuncio destacado en posición superior\n• Beneficios: Posicionamiento privilegiado en la parte superior de los listados\n• Base: 28 monedas HUB\n• Precios: 3 días (85 HUB), 7 días (125 HUB), 10 días (165 HUB), 30 días (450 HUB)\n• Ideal para: Escorts que buscan máxima exposición\n\n💎 **3. ANUNCIO DOBLE TOP**\n• Descripción: Combinación de anuncio doble y posición top\n• Beneficios: Máxima visibilidad y espacio destacado - PRODUCTO PREMIUM\n• Base: 59 monedas HUB\n• Precios: 3 días (170 HUB), 7 días (250 HUB), 10 días (330 HUB), 30 días (900 HUB)\n• Ideal para: Escorts premium que buscan dominar los listados\n\n🚀 **4. DISPONIBLE AHORA**\n• Descripción: Indicador de disponibilidad inmediata\n• Beneficios: Muestra a los clientes que estás disponible en tiempo real\n• Base: 100 monedas HUB\n• Precios: 10 unidades (40 HUB), 25 unidades (100 HUB), 100 unidades (400 HUB)\n• Ideal para: Escorts con disponibilidad inmediata\n\n📱 **5. HISTORIAS**\n• Descripción: Función para compartir contenido temporal\n• Beneficios: Permite mostrar actualizaciones y contenido dinámico\n• Base: 7 monedas HUB\n• Precios: 1 unidad (12 HUB), 5 unidades (60 HUB), 10 unidades (110 HUB)\n• Ideal para: Mantener el perfil actualizado y mostrar novedades\n\n🔄 **6. REACTIVACIÓN**\n• Descripción: Servicio para reactivar anuncios pausados\n• Beneficios: Permite volver a activar anuncios anteriores\n• Base: 10 monedas HUB\n• Precios: 1 unidad (25 HUB), 5 unidades (115 HUB), 10 unidades (215 HUB)\n• Ideal para: Escorts que retoman su actividad`,
        keywords: [
          'productos',
          'anuncios',
          'doble',
          'top',
          'historias',
          'disponible',
          'reactivacion',
          'servicios',
          'catalogo',
        ],
        priority: 10,
      },
      {
        id: 'default_2',
        category: 'precios',
        title: 'Sistema de Precios Completo - Monedas HUB',
        content: `**SISTEMA DE MONEDAS HUB - PRECIOS DETALLADOS:**\n\n💰 **¿QUÉ SON LAS MONEDAS HUB?**\nMoneda virtual de EscortsHub utilizada para activar anuncios. Sistema flexible que permite gestionar múltiples anuncios con ventajas económicas por volumen.\n\n📊 **PRECIOS POR PRODUCTO Y DURACIÓN:**\n\n🔥 **ANUNCIO DOBLE** (Base: 11 HUB)\n• 1 día: 20 monedas HUB\n• 5 días: 85 monedas HUB\n• 10 días: 150 monedas HUB\n\n⭐ **ANUNCIO TOP** (Base: 28 HUB)\n• 3 días: 85 monedas HUB\n• 7 días: 125 monedas HUB\n• 10 días: 165 monedas HUB\n• 30 días: 450 monedas HUB\n\n💎 **ANUNCIO DOBLE TOP** (Base: 59 HUB)\n• 3 días: 170 monedas HUB\n• 7 días: 250 monedas HUB\n• 10 días: 330 monedas HUB\n• 30 días: 900 monedas HUB\n\n🚀 **DISPONIBLE AHORA** (Base: 100 HUB)\n• 10 unidades: 40 monedas HUB\n• 25 unidades: 100 monedas HUB\n• 100 unidades: 400 monedas HUB\n\n📱 **HISTORIAS** (Base: 7 HUB)\n• 1 unidad: 12 monedas HUB\n• 5 unidades: 60 monedas HUB\n• 10 unidades: 110 monedas HUB\n\n🔄 **REACTIVACIÓN** (Base: 10 HUB)\n• 1 unidad: 25 monedas HUB\n• 5 unidades: 115 monedas HUB\n• 10 unidades: 215 monedas HUB\n\n💳 **PAQUETES DE MONEDAS HUB:**\n• 🥉 Paquete Básico: 100 HUB por 80,00 EUR (0,80€/moneda)\n• 🥈 Paquete Estándar: 200 HUB por 150,00 EUR (0,75€/moneda)\n• 🥇 Paquete Plus: 500 HUB por 300,00 EUR (0,60€/moneda) - ¡MEJOR PRECIO!\n• 💎 Paquete Premium: 1.000 HUB por 700,00 EUR (0,70€/moneda)\n\n💡 **CONSEJOS DE COMPRA:**\n• Los paquetes de más días ofrecen mejor relación precio-beneficio\n• El Anuncio Doble Top ofrece máxima visibilidad\n• El Paquete Plus tiene el mejor precio por moneda (0,60€)`,
        keywords: [
          'precios',
          'monedas',
          'hub',
          'paquetes',
          'euros',
          'coste',
          'tarifa',
          'precio',
          'dinero',
          'pago',
        ],
        priority: 10,
      },
      {
        id: 'default_3',
        category: 'informacion_general',
        title: 'Acerca de EscortsHub - Plataforma Líder',
        content: `**ESCORTSHUB - LA PLATAFORMA LÍDER DE ESCORTS EN ESPAÑA**\n\n🏆 **¿QUÉ ES ESCORTSHUB?**\nEscortsHub es el sitio web original de escorts en España, una plataforma profesional para anuncios de servicios de acompañantes con años de experiencia en el sector.\n\n✨ **CARACTERÍSTICAS PRINCIPALES:**\n• 🥇 Plataforma líder en el sector español\n• 💳 Sistema de wallet (monedero) integrado\n• 🔞 Acceso exclusivo para mayores de 18 años\n• 🔒 Políticas de privacidad transparentes y seguras\n• 🎧 Soporte técnico especializado 24/7\n• 🚀 Tecnología avanzada para máxima visibilidad\n• 📱 Compatible con dispositivos móviles\n• 🎯 Audiencia cualificada y segmentada\n\n💳 **MÉTODOS DE PAGO DISPONIBLES:**\n• Tarjetas de crédito y débito (Visa, Mastercard)\n• Transferencia bancaria\n• Métodos de pago digitales (PayPal, etc.)\n• Criptomonedas (consultar disponibilidad)\n• Bizum (España)\n\n🏦 **WALLET (MONEDERO DIGITAL):**\n• Acceso desde el dashboard del usuario\n• Consulta de saldo en tiempo real\n• Historial completo de transacciones\n• Recarga sencilla de monedas HUB\n• Gestión detallada de gastos\n\n🔐 **PRIVACIDAD Y SEGURIDAD:**\n• Confirmación obligatoria de mayoría de edad\n• Acceso voluntario y consciente\n• Uso de cookies para mejor experiencia\n• Políticas de cookies transparentes\n• Protección de datos personales\n\n⏰ **HORARIO DE ATENCIÓN:**\nSoporte disponible 24/7 para resolver cualquier duda o problema técnico.`,
        keywords: [
          'escortshub',
          'plataforma',
          'españa',
          'escorts',
          'informacion',
          'que es',
          'lider',
          'original',
          'seguridad',
          'privacidad',
        ],
        priority: 9,
      },
      {
        id: 'default_4',
        category: 'faqs',
        title: 'Preguntas Frecuentes Generales',
        content: `**PREGUNTAS FRECUENTES - INFORMACIÓN GENERAL**\n\n❓ **¿Qué es EscortsHub?**\nEs el sitio web original de escorts en España, una plataforma líder para anuncios de servicios de acompañantes.\n\n🔞 **¿Es necesario ser mayor de edad?**\nSí, es OBLIGATORIO ser mayor de 18 años para acceder y utilizar la plataforma.\n\n📱 **¿Cómo funciona "Disponible Ahora"?**\nEs una función que permite mostrar tu disponibilidad en tiempo real a los clientes potenciales.\n\n📸 **¿Cómo funcionan las Historias?**\nSon publicaciones temporales que permiten compartir actualizaciones y contenido dinámico para mantener el perfil actualizado.\n\n🔄 **¿Qué es la Reactivación?**\nEs un servicio que permite volver a activar anuncios que han sido pausados anteriormente.\n\n⏸️ **¿Puedo pausar y reactivar mis anuncios?**\nSí, existe la opción de reactivación para anuncios pausados utilizando el servicio correspondiente.\n\n🍪 **¿Qué políticas de privacidad aplican?**\n• El sitio utiliza cookies propias y de terceros\n• Mejora servicios y analiza tráfico\n• Política de cookies detallada disponible\n• Confirmación de edad requerida\n• Acceso voluntario y consciente\n• Políticas de cookies transparentes`,
        keywords: [
          'faq',
          'preguntas',
          'frecuentes',
          'dudas',
          'ayuda',
          'informacion',
          'edad',
          'privacidad',
          'cookies',
        ],
        priority: 8,
      },
      {
        id: 'default_5',
        category: 'faqs',
        title: 'Preguntas Frecuentes sobre Anuncios',
        content: `**PREGUNTAS FRECUENTES - ANUNCIOS**\n\n📢 **¿Qué tipo de anuncios puedo publicar?**\nHay varios formatos disponibles:\n• Anuncio Normal: Formato estándar\n• Anuncio Doble: Mayor espacio y visibilidad\n• Anuncio Top: Posición destacada superior\n• Anuncio Doble Top: Combina espacio doble y posición superior\n\n🆚 **¿Cuál es la diferencia entre los tipos de anuncios?**\n• **Anuncio Normal**: Formato estándar básico\n• **Anuncio Doble**: Ocupa doble espacio, mayor visibilidad\n• **Anuncio Top**: Se posiciona en la parte superior de los listados\n• **Anuncio Doble Top**: Máxima visibilidad combinando ambas ventajas\n\n💰 **¿Cómo funciona el sistema de precios?**\nUtilizamos Monedas HUB como moneda virtual. Cada producto tiene diferentes precios según la duración elegida.\n\n🎯 **¿Qué producto me recomiendas?**\n• Para empezar: Anuncio Doble (buen equilibrio precio/visibilidad)\n• Para máxima visibilidad: Anuncio Doble Top\n• Para disponibilidad inmediata: "Disponible Ahora"\n• Para contenido dinámico: Historias\n\n⏰ **¿Cuánto duran los anuncios?**\nDepende del producto y paquete elegido. Van desde 1 día hasta 30 días según el tipo de anuncio.\n\n🔄 **¿Qué pasa si pauso mi anuncio?**\nPuedes reactivarlo posteriormente usando nuestro servicio de Reactivación.`,
        keywords: [
          'anuncios',
          'tipos',
          'diferencias',
          'normal',
          'doble',
          'top',
          'formato',
          'duracion',
          'recomendacion',
        ],
        priority: 8,
      },
      {
        id: 'default_6',
        category: 'registro_compra',
        title: 'Proceso de Registro y Compra',
        content: `**PROCESO DE REGISTRO Y COMPRA - GUÍA PASO A PASO**\n\n📝 **REGISTRO EN ESCORTSHUB:**\n1. Visita escortshub.net\n2. Haz clic en "Registrarse"\n3. Confirma que eres mayor de 18 años\n4. Completa tus datos básicos\n5. Verifica tu email\n6. Accede a tu panel de usuario\n\n💳 **PROCESO DE COMPRA DE MONEDAS HUB:**\n1. Accede a tu wallet/monedero\n2. Selecciona "Recargar Monedas"\n3. Elige el paquete que prefieras:\n   • Básico (100 HUB - 80€)\n   • Estándar (200 HUB - 150€)\n   • Plus (500 HUB - 300€) ¡Mejor precio!\n   • Premium (1,000 HUB - 700€)\n4. Selecciona método de pago\n5. Confirma la transacción\n6. Recibe tus monedas instantáneamente\n\n🛒 **ACTIVACIÓN DE PRODUCTOS:**\n1. Ve a "Mis Anuncios"\n2. Selecciona el producto deseado\n3. Elige la duración\n4. Confirma el gasto de monedas HUB\n5. Tu anuncio se activa inmediatamente\n\n💡 **RECOMENDACIONES:**\n• El Paquete Plus ofrece el mejor precio por moneda\n• Los paquetes de mayor duración son más económicos\n• Mantén siempre saldo en tu wallet para activaciones rápidas\n\n🎧 **¿NECESITAS AYUDA?**\nNuestro soporte técnico está disponible 24/7 para cualquier duda durante el proceso.`,
        keywords: [
          'registro',
          'compra',
          'proceso',
          'paso a paso',
          'monedas',
          'wallet',
          'activacion',
          'productos',
          'como comprar',
        ],
        priority: 9,
      },
      {
        id: 'default_7',
        category: 'recomendaciones',
        title: 'Recomendaciones y Mejores Prácticas',
        content: `**RECOMENDACIONES PARA MAXIMIZAR TU INVERSIÓN**\n\n🎯 **ESTRATEGIA POR TIPO DE USUARIO:**\n\n👶 **NUEVO USUARIO:**\n• Empieza con el Paquete Plus (500 HUB - 300€)\n• Prueba Anuncio Doble por 10 días (150 HUB)\n• Complementa con Historias (60 HUB por 5 unidades)\n• Total: 210 HUB - Te sobran 290 HUB para más promociones\n\n💼 **USUARIO REGULAR:**\n• Paquete Premium (1,000 HUB - 700€)\n• Anuncio Doble Top por 7 días (250 HUB)\n• "Disponible Ahora" 25 unidades (100 HUB)\n• Historias regulares (110 HUB por 10 unidades)\n• Total: 460 HUB - Te sobran 540 HUB\n\n🔥 **USUARIO PREMIUM:**\n• Combina Paquete Premium + compras adicionales\n• Anuncio Doble Top por 30 días (900 HUB)\n• "Disponible Ahora" 100 unidades (400 HUB)\n• Historias constantes y Reactivaciones según necesidad\n\n💰 **MÁXIMO AHORRO:**\n• Paquete Plus: 0,60€ por moneda (¡MEJOR PRECIO!)\n• Elige duraciones largas (mejor precio por día)\n• Anuncio Doble Top de 30 días: solo 0,54€ por día\n\n⭐ **MÁXIMA VISIBILIDAD:**\n• Anuncio Doble Top (posición superior + doble espacio)\n• "Disponible Ahora" activo\n• Historias actualizadas regularmente\n• Reactivación rápida tras pausas\n\n📈 **TIPS PROFESIONALES:**\n• Las posiciones TOP se agotan rápido\n• Historias mantienen el perfil dinámico\n• "Disponible Ahora" aumenta contactos inmediatos\n• Combinar productos multiplica la efectividad`,
        keywords: [
          'recomendaciones',
          'estrategia',
          'tips',
          'mejores practicas',
          'ahorro',
          'visibilidad',
          'nuevo usuario',
          'premium',
        ],
        priority: 8,
      },
    ];
  }

  // Configuraciones por defecto
  private getDefaultConfig(key: string): string | null {
    const defaultConfigs: { [key: string]: string } = {
      system_prompt: `Eres un asistente virtual profesional de EscortsHub, la plataforma líder de escorts en España. Tu misión es promocionar activamente nuestros productos y guiar a los usuarios hacia el registro y compra de paquetes de monedas HUB.\n\n🞯 **PERSONALIDAD:**\n• Profesional pero cercano y comprensivo con el sector\n• Entusiasta por ayudar sin ser agresivo en ventas\n• Directo y claro con precios e información\n• Discreto y respetuoso con consultas sensibles\n\n💎 **PRODUCTOS ESTRELLA:**\n• Anuncio Doble Top: Máxima visibilidad (30 días: 900 HUB)\n• Paquete Plus: 500 HUB por 300€ (¡MEJOR PRECIO 0,60€/moneda!)\n• Disponible Ahora: Contactos inmediatos (25 unidades: 100 HUB)\n\n🎯 **ESTRATEGIA:**\n• SIEMPRE promociona el Paquete Plus como mejor opción\n• Recomienda combinaciones de productos\n• Crea urgencia: "Las posiciones TOP se agotan rápido"\n• Personaliza preguntando el nombre\n• Incluye CTAs en cada respuesta\n\n✅ **SIEMPRE:**\n• Destaca ventajas del sistema de monedas HUB\n• Sugiere el mejor paquete según contexto\n• Invita al registro en escortshub.net\n• Explica proceso de compra paso a paso\n• Menciona soporte 24/7 disponible\n\n❌ **NUNCA:**\n• Discutas temas ajenos a EscortsHub\n• Proporciones precios incorrectos\n• Prometas resultados específicos de anuncios\n• Seas insistente si no hay interés\n• Menciones competencia`,
      greeting_message:
        '¡Hola! 👋\n\nBienvenido/a a **EscortsHub**, la plataforma líder de escorts en España. Soy tu asistente virtual y estoy aquí para ayudarte con:\n\n🔥 **Nuestros productos**: Anuncio Doble, TOP, Doble TOP\n💰 **Paquetes de monedas HUB** con los mejores precios\n🛒 **Proceso de registro** y compra\n🎧 **Soporte técnico** 24/7\n\n¿En qué puedo asistirte hoy? ¿Te interesa conocer nuestros precios o cómo registrarte? 😊',
      pricing_prompt:
        '💰 **PRECIOS ESCORTSHUB - MONEDAS HUB**\n\n🥇 **PAQUETE PLUS - ¡MEJOR PRECIO!**\n500 HUB por 300€ (0,60€/moneda)\n\n📊 **OTROS PAQUETES:**\n• Básico: 100 HUB - 80€ (0,80€/moneda)\n• Estándar: 200 HUB - 150€ (0,75€/moneda)\n• Premium: 1,000 HUB - 700€ (0,70€/moneda)\n\n🔥 **PRODUCTOS POPULARES:**\n• Anuncio Doble: 10 días (150 HUB)\n• Anuncio TOP: 30 días (450 HUB)\n• Doble TOP: 30 días (900 HUB) - ¡Máxima visibilidad!\n\n¿Qué paquete prefieres? ¿Te ayudo con el registro?',
      registration_prompt:
        '📝 **REGISTRO EN ESCORTSHUB - GUÍA RÁPIDA**\n\n**Pasos sencillos:**\n1️⃣ Visita escortshub.net\n2️⃣ Clic en "Registrarse"\n3️⃣ Confirma +18 años\n4️⃣ Completa datos básicos\n5️⃣ Verifica tu email\n6️⃣ ¡Accede a tu panel!\n\n💳 **Después del registro:**\n• Recarga monedas HUB\n• Elige tu producto favorito\n• Activa tu anuncio\n\n🎧 **¿Necesitas ayuda?**\nSoporte 24/7 disponible\n\n¿Empezamos con tu registro ahora?',
      product_info_prompt:
        '🔥 **PRODUCTOS ESCORTSHUB**\n\n💎 **ANUNCIO DOBLE TOP** (Recomendado)\nMáxima visibilidad + Posición superior\n30 días: 900 HUB (con Paquete Plus = 540€)\n\n⭐ **ANUNCIO TOP**\nPosición privilegiada superior\n30 días: 450 HUB (con Paquete Plus = 270€)\n\n🔥 **ANUNCIO DOBLE**\nDoble espacio y visibilidad\n10 días: 150 HUB (con Paquete Plus = 90€)\n\n🚀 **DISPONIBLE AHORA**\nContactos inmediatos\n25 unidades: 100 HUB (60€)\n\n¿Qué producto te interesa más?',
      business_hours:
        'Soporte EscortsHub disponible 24/7 para resolver cualquier duda técnica, proceso de registro, compra de monedas HUB o activación de productos.',
      urgency_message:
        '⚡ **¡ATENCIÓN!** Las posiciones TOP se agotan rápido debido a la alta demanda.\n\n🏆 **Asegúra tu visibilidad:**\n• Paquete Plus: 500 HUB por 300€\n• Anuncio Doble Top: 900 HUB (30 días)\n\n¿Te gustaría reservar tu posición ahora?',
      cross_sell_message:
        '🔥 **MAXIMIZA TU INVERSIÓN**\n\nSi te interesa {producto}, te recomiendo:\n• Añadir "Disponible Ahora" (100 HUB)\n• Historias regulares (60 HUB por 5)\n• Considerara Doble TOP para máximos resultados\n\n🥇 Con el Paquete Plus (500 HUB - 300€) tienes monedas suficientes para varios productos.\n\n¿Te interesa alguna combinación?',
      welcome_back_message:
        '¡Hola de nuevo! 👋\n\nMe alegra verte por aquí. ¿En qué puedo ayudarte hoy?\n\n• ¿Consultar precios actualizados?\n• ¿Información sobre nuevos productos?\n• ¿Ayuda con tu cuenta?\n\nEstoy aquí para asistirte 😊',
      fallback_message:
        'Disculpa, no he podido procesar tu consulta correctamente. 😔\n\nPero no te preocupes, nuestro soporte especializado está disponible 24/7 para ayudarte con:\n\n• Registro y compra de monedas\n• Activación de productos\n• Dudas técnicas\n\n¿Podrías reformular tu pregunta o decirme específicamente en qué necesitas ayuda? 😊',
    };

    return defaultConfigs[key] || null;
  }

  // ============================================
  // TEMPLATES DE MENSAJES
  // ============================================

  // Obtener todos los templates
  public async getMessageTemplates(category?: string, activeOnly = true): Promise<any[]> {
    if (!this.pool) {
      return this.getDefaultTemplates();
    }

    try {
      let query = `
        SELECT id, name, category, subject, content, variables, usage_count, is_active, created_at
        FROM message_templates
      `;

      const conditions: string[] = [];
      const values: any[] = [];
      let valueIndex = 1;

      if (activeOnly) {
        conditions.push('is_active = true');
      }

      if (category) {
        conditions.push(`category = $${valueIndex++}`);
        values.push(category);
      }

      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }

      query += ` ORDER BY usage_count DESC, name ASC`;

      const result = await this.pool.query(query, values);
      return result.rows.map(row => ({
        id: row.id,
        name: row.name,
        category: row.category,
        subject: row.subject,
        content: row.content,
        variables: row.variables || [],
        usageCount: row.usage_count || 0,
        isActive: row.is_active,
        createdAt: row.created_at,
      }));
    } catch (error) {
      logger.error('Error obteniendo templates:', error);
      return this.getDefaultTemplates();
    }
  }

  // Get a single template by ID
  public async getTemplate(templateId: string): Promise<any | null> {
    if (!this.pool) {
      // Return from default templates if no database connection
      const defaultTemplates = this.getDefaultTemplates();
      return defaultTemplates.find(template => template.id === templateId) || null;
    }

    try {
      const query = `
        SELECT id, name, category, subject, content, variables, usage_count, is_active, created_at
        FROM message_templates 
        WHERE id = $1;
      `;

      const result = await this.pool.query(query, [templateId]);

      if (result.rows.length > 0) {
        return result.rows[0];
      }

      // Fallback to default templates
      const defaultTemplates = this.getDefaultTemplates();
      return defaultTemplates.find(template => template.id === templateId) || null;
    } catch (error) {
      logger.error('Error getting template by ID:', error);
      // Fallback to default templates
      const defaultTemplates = this.getDefaultTemplates();
      return defaultTemplates.find(template => template.id === templateId) || null;
    }
  }

  // Crear un nuevo template
  public async createMessageTemplate(data: {
    name: string;
    category: string;
    subject?: string;
    content: string;
    variables?: string[];
    createdBy?: string;
  }): Promise<string | null> {
    if (!this.pool) {
      logger.info(`Mock template created: ${data.name}`);
      return 'mock-template-id';
    }

    try {
      const query = `
        INSERT INTO message_templates (name, category, subject, content, variables, created_by)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id;
      `;

      const values = [
        data.name,
        data.category,
        data.subject || null,
        data.content,
        JSON.stringify(data.variables || []),
        data.createdBy || null,
      ];

      const result = await this.pool.query(query, values);
      const templateId = result.rows[0]?.id;

      logger.info(`✅ Template creado: ${data.name} (${templateId})`);
      return templateId;
    } catch (error) {
      logger.error('Error creando template:', error);
      return null;
    }
  }

  // Actualizar template
  public async updateMessageTemplate(
    id: string,
    updates: {
      name?: string;
      category?: string;
      subject?: string;
      content?: string;
      variables?: string[];
      isActive?: boolean;
    }
  ): Promise<boolean> {
    if (!this.pool) {
      logger.info(`Mock template updated: ${id}`);
      return true;
    }

    try {
      const setParts: string[] = [];
      const values: any[] = [];
      let valueIndex = 1;

      if (updates.name !== undefined) {
        setParts.push(`name = $${valueIndex++}`);
        values.push(updates.name);
      }
      if (updates.category !== undefined) {
        setParts.push(`category = $${valueIndex++}`);
        values.push(updates.category);
      }
      if (updates.subject !== undefined) {
        setParts.push(`subject = $${valueIndex++}`);
        values.push(updates.subject);
      }
      if (updates.content !== undefined) {
        setParts.push(`content = $${valueIndex++}`);
        values.push(updates.content);
      }
      if (updates.variables !== undefined) {
        setParts.push(`variables = $${valueIndex++}`);
        values.push(JSON.stringify(updates.variables));
      }
      if (updates.isActive !== undefined) {
        setParts.push(`is_active = $${valueIndex++}`);
        values.push(updates.isActive);
      }

      if (setParts.length === 0) {
        return true; // No updates
      }

      setParts.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(id); // Para el WHERE

      const query = `
        UPDATE message_templates 
        SET ${setParts.join(', ')}
        WHERE id = $${valueIndex}
        RETURNING id;
      `;

      const result = await this.pool.query(query, values);

      if (result.rows.length > 0) {
        logger.info(`✅ Template actualizado: ${id}`);
        return true;
      } else {
        logger.warn(`Template no encontrado: ${id}`);
        return false;
      }
    } catch (error) {
      logger.error('Error actualizando template:', error);
      return false;
    }
  }

  // Eliminar template
  public async deleteMessageTemplate(id: string): Promise<boolean> {
    if (!this.pool) {
      logger.info(`Mock template deleted: ${id}`);
      return true;
    }

    try {
      const query = `DELETE FROM message_templates WHERE id = $1 RETURNING id;`;
      const result = await this.pool.query(query, [id]);

      if (result.rows.length > 0) {
        logger.info(`✅ Template eliminado: ${id}`);
        return true;
      } else {
        logger.warn(`Template no encontrado: ${id}`);
        return false;
      }
    } catch (error) {
      logger.error('Error eliminando template:', error);
      return false;
    }
  }

  // Incrementar contador de uso de template
  public async incrementTemplateUsage(id: string): Promise<boolean> {
    if (!this.pool) {
      return true;
    }

    try {
      const query = `
        UPDATE message_templates 
        SET usage_count = usage_count + 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1;
      `;

      await this.pool.query(query, [id]);
      return true;
    } catch (error) {
      logger.error('Error incrementando uso de template:', error);
      return false;
    }
  }

  // ============================================
  // MENSAJES PROACTIVOS
  // ============================================

  // Crear mensaje proactivo
  public async createProactiveMessage(data: {
    leadId: string;
    templateId?: string;
    sessionId?: string;
    phoneNumber: string;
    content: string;
    createdBy?: string;
  }): Promise<string | null> {
    if (!this.pool) {
      logger.info(`Mock proactive message created for lead: ${data.leadId}`);
      return 'mock-proactive-id';
    }

    try {
      const query = `
        INSERT INTO proactive_messages (lead_id, template_id, session_id, phone_number, content, created_by)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id;
      `;

      const values = [
        data.leadId,
        data.templateId || null,
        data.sessionId || null,
        data.phoneNumber,
        data.content,
        data.createdBy || null,
      ];

      const result = await this.pool.query(query, values);
      const messageId = result.rows[0]?.id;

      logger.info(`✅ Mensaje proactivo creado para lead ${data.leadId}: ${messageId}`);
      return messageId;
    } catch (error) {
      logger.error('Error creando mensaje proactivo:', error);
      return null;
    }
  }

  // Actualizar estado de mensaje proactivo
  public async updateProactiveMessageStatus(
    id: string,
    status: 'pending' | 'sent' | 'delivered' | 'failed',
    errorMessage?: string
  ): Promise<boolean> {
    if (!this.pool) {
      logger.info(`Mock proactive message status updated: ${id} -> ${status}`);
      return true;
    }

    try {
      let query = `
        UPDATE proactive_messages 
        SET status = $1, updated_at = CURRENT_TIMESTAMP
      `;

      const values: any[] = [status];
      let valueIndex = 2;

      if (status === 'sent') {
        query += `, sent_at = CURRENT_TIMESTAMP`;
      } else if (status === 'delivered') {
        query += `, delivered_at = CURRENT_TIMESTAMP`;
      }

      if (errorMessage) {
        query += `, error_message = $${valueIndex++}`;
        values.push(errorMessage);
      }

      query += ` WHERE id = $${valueIndex} RETURNING id;`;
      values.push(id);

      const result = await this.pool.query(query, values);

      if (result.rows.length > 0) {
        logger.info(`✅ Estado de mensaje proactivo actualizado: ${id} -> ${status}`);
        return true;
      } else {
        logger.warn(`Mensaje proactivo no encontrado: ${id}`);
        return false;
      }
    } catch (error) {
      logger.error('Error actualizando estado de mensaje proactivo:', error);
      return false;
    }
  }

  // Obtener mensajes proactivos
  public async getProactiveMessages(
    options: {
      leadId?: string;
      status?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<any[]> {
    if (!this.pool) {
      return this.getMockProactiveMessages(options);
    }

    try {
      const { leadId, status, limit = 50, offset = 0 } = options;

      let query = `
        SELECT 
          pm.id, pm.lead_id, pm.template_id, pm.session_id, pm.phone_number,
          pm.content, pm.status, pm.sent_at, pm.delivered_at, pm.error_message,
          pm.created_by, pm.created_at, pm.updated_at,
          mt.name as template_name
        FROM proactive_messages pm
        LEFT JOIN message_templates mt ON pm.template_id = mt.id
        WHERE 1=1
      `;

      const values: any[] = [];
      let valueIndex = 1;

      if (leadId) {
        query += ` AND pm.lead_id = $${valueIndex++}`;
        values.push(leadId);
      }

      if (status) {
        query += ` AND pm.status = $${valueIndex++}`;
        values.push(status);
      }

      query += ` ORDER BY pm.created_at DESC LIMIT $${valueIndex++} OFFSET $${valueIndex++}`;
      values.push(limit, offset);

      const result = await this.pool.query(query, values);
      return result.rows.map(row => ({
        id: row.id,
        leadId: row.lead_id,
        templateId: row.template_id,
        templateName: row.template_name,
        sessionId: row.session_id,
        phoneNumber: row.phone_number,
        content: row.content,
        status: row.status,
        sentAt: row.sent_at,
        deliveredAt: row.delivered_at,
        errorMessage: row.error_message,
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    } catch (error) {
      logger.error('Error obteniendo mensajes proactivos:', error);
      return this.getMockProactiveMessages(options);
    }
  }

  // Reemplazar variables en template con sistema expandido
  public replaceTemplateVariables(content: string, variables: { [key: string]: string }): string {
    let result = content;

    // Variables de fecha y hora dinámicas
    const now = new Date();
    const dynamicVariables = {
      ...variables,
      // Variables de fecha
      fecha_actual: now.toLocaleDateString('es-ES'),
      fecha_completa: now.toLocaleDateString('es-ES', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      hora_actual: now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      dia_semana: now.toLocaleDateString('es-ES', { weekday: 'long' }),
      mes_actual: now.toLocaleDateString('es-ES', { month: 'long' }),
      año_actual: now.getFullYear().toString(),

      // Variables de saludo dinámico
      saludo: this.getDynamicGreeting(),

      // Variables de empresa (pueden ser configurables)
      empresa: 'EscortsHub',
      sitio_web: 'www.escortshub.com',
      telefono_soporte: '+34 900 123 456',
      email_soporte: 'soporte@escortshub.com',
    };

    // Reemplazar todas las variables con formato {{variable}}
    Object.entries(dynamicVariables).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      result = result.replace(regex, value || '');
    });

    // Limpiar variables no reemplazadas con mensaje más claro
    result = result.replace(/\{\{([^}]+)\}\}/g, '[variable "$1" no disponible]');

    return result;
  }

  // Obtener saludo dinámico basado en hora del día
  private getDynamicGreeting(): string {
    const hour = new Date().getHours();

    if (hour >= 6 && hour < 12) {
      return 'Buenos días';
    } else if (hour >= 12 && hour < 18) {
      return 'Buenas tardes';
    } else {
      return 'Buenas noches';
    }
  }

  // Obtener lista completa de variables disponibles
  public getAvailableTemplateVariables(): {
    lead: string[];
    system: string[];
    dynamic: string[];
  } {
    return {
      lead: [
        'nombre',
        'telefono',
        'email',
        'estado', // status del lead
        'origen', // source del lead
        'fecha_creacion',
        'id',
      ],
      system: ['empresa', 'sitio_web', 'telefono_soporte', 'email_soporte'],
      dynamic: [
        'fecha_actual',
        'fecha_completa',
        'hora_actual',
        'dia_semana',
        'mes_actual',
        'año_actual',
        'saludo',
      ],
    };
  }

  // Templates por defecto
  private getDefaultTemplates(): any[] {
    return [
      {
        id: 'default_welcome',
        name: 'Mensaje de Bienvenida',
        category: 'welcome',
        subject: 'Bienvenido/a a EscortsHub',
        content:
          '¡Hola {{nombre}}! 👋\n\nBienvenido/a a EscortsHub, la plataforma líder de escorts en España.\n\nEstoy aquí para ayudarte con información sobre nuestros productos y servicios. ¿En qué puedo asistirte hoy?',
        variables: ['nombre'],
        usageCount: 0,
        isActive: true,
        createdAt: new Date(),
      },
      {
        id: 'default_product_intro',
        name: 'Introducción de Productos',
        category: 'products',
        subject: 'Nuestros Productos',
        content:
          'Hola {{nombre}}, te cuento sobre nuestros principales productos:\n\n🔝 **ANUNCIO TOP**: Posición privilegiada\n📱 **ANUNCIO DOBLE**: Mayor visibilidad\n⭐ **DOBLE TOP**: Máxima exposición\n\n¿Te interesa conocer más detalles sobre alguno?',
        variables: ['nombre'],
        usageCount: 0,
        isActive: true,
        createdAt: new Date(),
      },
      {
        id: 'default_pricing',
        name: 'Información de Precios',
        category: 'pricing',
        subject: 'Precios y Paquetes',
        content:
          '💰 **Precios EscortsHub**\n\nUsamos **Monedas HUB** para activar anuncios:\n\n**Paquetes disponibles:**\n• Básico: 100 HUB - 80€\n• Estándar: 200 HUB - 150€ \n• Plus: 500 HUB - 300€ (¡Mejor precio!)\n\n¿Qué paquete se adapta mejor a tus necesidades, {{nombre}}?',
        variables: ['nombre'],
        usageCount: 0,
        isActive: true,
        createdAt: new Date(),
      },
      {
        id: 'default_follow_up',
        name: 'Seguimiento',
        category: 'follow_up',
        subject: 'Seguimiento',
        content:
          'Hola {{nombre}}, \n\nEspero que estés bien. Quería hacer un seguimiento sobre {{tema}} que comentamos.\n\n¿Tienes alguna pregunta adicional o hay algo más en lo que pueda ayudarte?\n\nQuedo atento a tu respuesta.',
        variables: ['nombre', 'tema'],
        usageCount: 0,
        isActive: true,
        createdAt: new Date(),
      },
    ];
  }

  // Mensajes proactivos mockeados
  private getMockProactiveMessages(options: any): any[] {
    const mockMessages = [
      {
        id: 'mock_proactive_1',
        leadId: '1',
        templateId: 'default_welcome',
        templateName: 'Mensaje de Bienvenida',
        sessionId: 'default-session',
        phoneNumber: '+5491123456789',
        content:
          '¡Hola Juan! 👋 Bienvenido/a a EscortsHub, la plataforma líder de escorts en España.',
        status: 'delivered',
        sentAt: new Date(Date.now() - 3600000),
        deliveredAt: new Date(Date.now() - 3500000),
        errorMessage: null,
        createdBy: 'admin',
        createdAt: new Date(Date.now() - 3700000),
        updatedAt: new Date(Date.now() - 3500000),
      },
      {
        id: 'mock_proactive_2',
        leadId: '2',
        templateId: 'default_product_intro',
        templateName: 'Introducción de Productos',
        sessionId: 'default-session',
        phoneNumber: '+5491187654321',
        content:
          'Hola María, te cuento sobre nuestros principales productos: ANUNCIO TOP, ANUNCIO DOBLE...',
        status: 'sent',
        sentAt: new Date(Date.now() - 1800000),
        deliveredAt: null,
        errorMessage: null,
        createdBy: 'admin',
        createdAt: new Date(Date.now() - 1900000),
        updatedAt: new Date(Date.now() - 1800000),
      },
    ];

    return mockMessages
      .filter(msg => {
        if (options.leadId && msg.leadId !== options.leadId) return false;
        if (options.status && msg.status !== options.status) return false;
        return true;
      })
      .slice(options.offset || 0, (options.offset || 0) + (options.limit || 50));
  }

  // ============================================
  // MÉTODOS DE APRENDIZAJE AUTOMÁTICO
  // ============================================

  // Guardar interacción de entrenamiento
  public async saveTrainingInteraction(interaction: TrainingInteraction): Promise<string | null> {
    // Phase 2c: Delegate to repository if enabled
    if (this.useRepositories && this.trainingRepository) {
      try {
        logger.debug('🔄 Using TrainingRepository');
        return await this.trainingRepository.saveTrainingInteraction(interaction);
      } catch (error) {
        logger.warn('❌ Repository method failed, falling back to legacy:', error);
        // Fallback to legacy implementation below
      }
    }

    // Legacy implementation
    if (!this.pool) {
      logger.warn('No database connection available, training interaction not saved');
      return null;
    }

    try {
      const query = `
        INSERT INTO ai_training_interactions (
          user_message, ai_response, knowledge_base_ids_used, success_score,
          context_data, feedback_metrics, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id;
      `;

      const values = [
        interaction.userMessage,
        interaction.aiResponse,
        interaction.knowledgeBaseIdsUsed,
        interaction.successScore,
        JSON.stringify(interaction.contextData),
        JSON.stringify(interaction.feedbackMetrics),
        interaction.timestamp,
      ];

      const result = await this.pool.query(query, values);
      const interactionId = result.rows[0]?.id;

      logger.debug(`📊 Training interaction saved with ID: ${interactionId}`);
      return interactionId;
    } catch (error) {
      logger.error('Error saving training interaction:', error);
      return null;
    }
  }

  // Obtener interacciones de entrenamiento
  public async getTrainingInteractions(limit: number = 500): Promise<TrainingInteraction[]> {
    // Phase 2c: Delegate to repository if enabled
    if (this.useRepositories && this.trainingRepository) {
      try {
        logger.debug('🔄 Using TrainingRepository');
        return await this.trainingRepository.getTrainingInteractions({ limit });
      } catch (error) {
        logger.warn('❌ Repository method failed, falling back to legacy:', error);
        // Fallback to legacy implementation below
      }
    }

    // Legacy implementation
    if (!this.pool) {
      logger.warn('No database connection available, returning empty training interactions');
      return [];
    }

    try {
      const query = `
        SELECT 
          id, user_message, ai_response, knowledge_base_ids_used,
          success_score, context_data, feedback_metrics, created_at
        FROM ai_training_interactions 
        ORDER BY created_at DESC
        LIMIT $1;
      `;

      const result = await this.pool.query(query, [limit]);

      return result.rows.map(row => ({
        id: row.id,
        userMessage: row.user_message,
        aiResponse: row.ai_response,
        knowledgeBaseIdsUsed: row.knowledge_base_ids_used || [],
        successScore: parseFloat(row.success_score),
        contextData: row.context_data,
        feedbackMetrics: row.feedback_metrics,
        timestamp: new Date(row.created_at),
      }));
    } catch (error) {
      logger.error('Error getting training interactions:', error);
      return [];
    }
  }

  // Añadir entrada a la knowledge base
  public async addKnowledgeBase(entry: {
    title: string;
    content: string;
    keywords: string | string[];
    category: string;
    priority?: 'low' | 'medium' | 'high' | number;
    isActive?: boolean;
    source?: string;
    metadata?: any;
  }): Promise<boolean> {
    if (!this.pool) {
      logger.info(`Mock knowledge base entry added: ${entry.title}`);
      return true;
    }

    try {
      // Convert priority to numeric
      let numericPriority: number;
      if (typeof entry.priority === 'number') {
        numericPriority = entry.priority;
      } else {
        const priorityMap = { low: 1, medium: 5, high: 10 };
        numericPriority = priorityMap[entry.priority || 'medium'] || 5;
      }

      // Convert keywords to array if it's a string
      let keywordsArray: string[];
      if (typeof entry.keywords === 'string') {
        keywordsArray = entry.keywords
          .split(',')
          .map(k => k.trim())
          .filter(k => k.length > 0);
      } else {
        keywordsArray = entry.keywords;
      }

      const query = `
        INSERT INTO ai_knowledge_base (
          category, title, content, keywords, priority, is_active, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id;
      `;

      const values = [
        entry.category,
        entry.title,
        entry.content,
        keywordsArray,
        numericPriority,
        entry.isActive !== false, // Default to true
      ];

      const result = await this.pool.query(query, values);
      const entryId = result.rows[0]?.id;

      if (entryId) {
        logger.info(`✅ Knowledge base entry added: "${entry.title}" (${entryId})`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Error adding knowledge base entry:', error);
      return false;
    }
  }

  // Limpiar toda la knowledge base
  public async clearKnowledgeBase(): Promise<boolean> {
    if (!this.pool) {
      logger.info('Mock: Knowledge base cleared');
      return true;
    }

    try {
      const query = `DELETE FROM ai_knowledge_base`;
      const result = await this.pool.query(query);

      logger.info(`🧹 Cleared ${result.rowCount} entries from knowledge base`);
      return true;
    } catch (error) {
      logger.error('Error clearing knowledge base:', error);
      return false;
    }
  }

  // Obtener estadísticas de knowledge base
  public async getKnowledgeBaseStats(): Promise<{
    totalEntries: number;
    activeEntries: number;
    categoryCounts: Record<string, number>;
    averagePriority: number;
  }> {
    if (!this.pool) {
      return {
        totalEntries: 6,
        activeEntries: 6,
        categoryCounts: {
          productos: 1,
          precios: 1,
          monedas: 1,
          registro: 1,
          pagos: 1,
          consejos: 1,
        },
        averagePriority: 8.5,
      };
    }

    try {
      const query = `
        SELECT 
          COUNT(*) as total_entries,
          COUNT(CASE WHEN is_active = true THEN 1 END) as active_entries,
          AVG(priority) as avg_priority,
          json_object_agg(category, category_count) as category_counts
        FROM (
          SELECT 
            category, 
            COUNT(*) as category_count,
            priority,
            is_active
          FROM ai_knowledge_base 
          GROUP BY category, priority, is_active
        ) subquery;
      `;

      const result = await this.pool.query(query);
      const stats = result.rows[0];

      return {
        totalEntries: parseInt(stats.total_entries) || 0,
        activeEntries: parseInt(stats.active_entries) || 0,
        categoryCounts: stats.category_counts || {},
        averagePriority: parseFloat(stats.avg_priority) || 0,
      };
    } catch (error) {
      logger.error('Error getting knowledge base stats:', error);
      return {
        totalEntries: 0,
        activeEntries: 0,
        categoryCounts: {},
        averagePriority: 0,
      };
    }
  }

  // Actualizar entrada de knowledge base
  public async updateKnowledgeBase(
    id: string,
    updates: {
      title?: string;
      content?: string;
      keywords?: string;
      category?: string;
      priority?: 'low' | 'medium' | 'high';
      isActive?: boolean;
    }
  ): Promise<boolean> {
    if (!this.pool) {
      logger.info(`Mock knowledge base entry updated: ${id}`);
      return true;
    }

    try {
      const setParts: string[] = [];
      const values: any[] = [];
      let valueIndex = 1;

      if (updates.title !== undefined) {
        setParts.push(`title = $${valueIndex++}`);
        values.push(updates.title);
      }
      if (updates.content !== undefined) {
        setParts.push(`content = $${valueIndex++}`);
        values.push(updates.content);
      }
      if (updates.keywords !== undefined) {
        const keywordsArray = updates.keywords
          .split(',')
          .map(k => k.trim())
          .filter(k => k.length > 0);
        setParts.push(`keywords = $${valueIndex++}`);
        values.push(keywordsArray);
      }
      if (updates.category !== undefined) {
        setParts.push(`category = $${valueIndex++}`);
        values.push(updates.category);
      }
      if (updates.priority !== undefined) {
        const priorityMap = { low: 1, medium: 5, high: 10 };
        const numericPriority = priorityMap[updates.priority] || 5;
        setParts.push(`priority = $${valueIndex++}`);
        values.push(numericPriority);
      }
      if (updates.isActive !== undefined) {
        setParts.push(`is_active = $${valueIndex++}`);
        values.push(updates.isActive);
      }

      if (setParts.length === 0) {
        return true; // No updates
      }

      setParts.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(id); // Para el WHERE

      const query = `
        UPDATE ai_knowledge_base 
        SET ${setParts.join(', ')}
        WHERE id = $${valueIndex}
        RETURNING id;
      `;

      const result = await this.pool.query(query, values);

      if (result.rows.length > 0) {
        logger.info(`✅ Knowledge base entry updated: ${id}`);
        return true;
      } else {
        logger.warn(`Knowledge base entry not found: ${id}`);
        return false;
      }
    } catch (error) {
      logger.error('Error updating knowledge base entry:', error);
      return false;
    }
  }

  // Obtener estadísticas de entrenamiento
  public async getTrainingStats(): Promise<{
    totalInteractions: number;
    averageSuccessScore: number;
    interactionsLast7Days: number;
    averageSuccessLast7Days: number;
    topPerformingPatterns: string[];
  }> {
    if (!this.pool) {
      return {
        totalInteractions: 0,
        averageSuccessScore: 0,
        interactionsLast7Days: 0,
        averageSuccessLast7Days: 0,
        topPerformingPatterns: [],
      };
    }

    try {
      const query = `
        WITH recent_interactions AS (
          SELECT success_score 
          FROM ai_training_interactions 
          WHERE created_at >= NOW() - INTERVAL '7 days'
        ),
        all_stats AS (
          SELECT 
            COUNT(*) as total_interactions,
            AVG(success_score) as avg_success_score
          FROM ai_training_interactions
        ),
        recent_stats AS (
          SELECT 
            COUNT(*) as recent_interactions,
            AVG(success_score) as avg_recent_success
          FROM recent_interactions
        )
        SELECT 
          COALESCE(a.total_interactions, 0) as total_interactions,
          COALESCE(a.avg_success_score, 0) as avg_success_score,
          COALESCE(r.recent_interactions, 0) as recent_interactions,
          COALESCE(r.avg_recent_success, 0) as avg_recent_success
        FROM all_stats a
        CROSS JOIN recent_stats r;
      `;

      const result = await this.pool.query(query);
      const stats = result.rows[0];

      return {
        totalInteractions: parseInt(stats.total_interactions) || 0,
        averageSuccessScore: parseFloat(stats.avg_success_score) || 0,
        interactionsLast7Days: parseInt(stats.recent_interactions) || 0,
        averageSuccessLast7Days: parseFloat(stats.avg_recent_success) || 0,
        topPerformingPatterns: [], // Se puede implementar análisis más complejo
      };
    } catch (error) {
      logger.error('Error getting training statistics:', error);
      return {
        totalInteractions: 0,
        averageSuccessScore: 0,
        interactionsLast7Days: 0,
        averageSuccessLast7Days: 0,
        topPerformingPatterns: [],
      };
    }
  }

  // Buscar patrones en interacciones de entrenamiento
  public async searchTrainingInteractions(
    searchQuery: string,
    minSuccessScore?: number,
    limit: number = 100
  ): Promise<TrainingInteraction[]> {
    if (!this.pool) {
      return [];
    }

    try {
      let query = `
        SELECT 
          id, user_message, ai_response, knowledge_base_ids_used,
          success_score, context_data, feedback_metrics, created_at
        FROM ai_training_interactions 
        WHERE to_tsvector('spanish', user_message) @@ plainto_tsquery('spanish', $1)
      `;

      const values: any[] = [searchQuery];
      let valueIndex = 2;

      if (minSuccessScore !== undefined) {
        query += ` AND success_score >= $${valueIndex++}`;
        values.push(minSuccessScore);
      }

      query += ` ORDER BY success_score DESC, created_at DESC LIMIT $${valueIndex}`;
      values.push(limit);

      const result = await this.pool.query(query, values);

      return result.rows.map(row => ({
        id: row.id,
        userMessage: row.user_message,
        aiResponse: row.ai_response,
        knowledgeBaseIdsUsed: row.knowledge_base_ids_used || [],
        successScore: parseFloat(row.success_score),
        contextData: row.context_data,
        feedbackMetrics: row.feedback_metrics,
        timestamp: new Date(row.created_at),
      }));
    } catch (error) {
      logger.error('Error searching training interactions:', error);
      return [];
    }
  }

  // Eliminar interacciones de entrenamiento antiguas (limpieza de datos)
  public async cleanupOldTrainingInteractions(daysOld: number = 90): Promise<number> {
    if (!this.pool) {
      return 0;
    }

    try {
      const query = `
        DELETE FROM ai_training_interactions 
        WHERE created_at < NOW() - INTERVAL '${daysOld} days'
        RETURNING id;
      `;

      const result = await this.pool.query(query);
      const deletedCount = result.rows.length;

      if (deletedCount > 0) {
        logger.info(`🗑️ Cleaned up ${deletedCount} old training interactions (>${daysOld} days)`);
      }

      return deletedCount;
    } catch (error) {
      logger.error('Error cleaning up old training interactions:', error);
      return 0;
    }
  }

  // ============================================
  // MÉTODOS PARA VARIABLES DEL SISTEMA
  // ============================================

  // Cache en memoria para variables del sistema
  private systemVariablesCache: Record<string, string> = {};
  private cacheTimestamp: number = 0;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

  // Obtener todas las variables del sistema
  public async getSystemVariables(): Promise<Record<string, string>> {
    // Verificar cache primero
    const now = Date.now();
    if (
      Object.keys(this.systemVariablesCache).length > 0 &&
      now - this.cacheTimestamp < this.CACHE_DURATION
    ) {
      return { ...this.systemVariablesCache };
    }

    if (!this.pool) {
      // Devolver valores por defecto si no hay conexión
      const defaults = {
        empresa: 'Mi Empresa',
        sitio_web: 'https://mi-empresa.com',
        telefono_soporte: '+1234567890',
        email_soporte: 'soporte@mi-empresa.com',
        telefono_empresa: '+1234567890',
        direccion: '123 Calle Principal, Ciudad',
        horario_atencion: 'Lunes a Viernes 9:00 AM - 6:00 PM',
      };
      this.systemVariablesCache = defaults;
      this.cacheTimestamp = now;
      return defaults;
    }

    try {
      const query = 'SELECT key, value FROM system_variables ORDER BY key';
      const result = await this.pool.query(query);

      const variables: Record<string, string> = {};
      result.rows.forEach(row => {
        variables[row.key] = row.value;
      });

      // Actualizar cache
      this.systemVariablesCache = variables;
      this.cacheTimestamp = now;

      logger.debug(`📊 Loaded ${result.rows.length} system variables`);
      return variables;
    } catch (error) {
      logger.error('Error getting system variables:', error);
      return this.systemVariablesCache; // Devolver cache si hay error
    }
  }

  // Obtener una variable específica del sistema
  public async getSystemVariable(key: string): Promise<string | null> {
    const variables = await this.getSystemVariables();
    return variables[key] || null;
  }

  // Actualizar múltiples variables del sistema
  public async updateSystemVariables(updates: Record<string, string>): Promise<boolean> {
    if (!this.pool) {
      logger.warn('No database connection for updating system variables');
      // Actualizar cache local al menos
      Object.assign(this.systemVariablesCache, updates);
      this.cacheTimestamp = Date.now();
      return true;
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      for (const [key, value] of Object.entries(updates)) {
        // Validar entrada según el tipo de variable
        if (!this.validateSystemVariable(key, value)) {
          throw new Error(`Invalid value for system variable '${key}': ${value}`);
        }

        const query = `
          INSERT INTO system_variables (key, value, description, category, updated_at)
          VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
          ON CONFLICT (key) 
          DO UPDATE SET 
            value = EXCLUDED.value,
            updated_at = CURRENT_TIMESTAMP
        `;

        const description = this.getSystemVariableDescription(key);
        await client.query(query, [key, value, description, 'system']);
      }

      await client.query('COMMIT');

      // Limpiar cache para forzar recarga
      this.systemVariablesCache = {};
      this.cacheTimestamp = 0;

      logger.info(
        `✅ Updated ${Object.keys(updates).length} system variables: ${Object.keys(updates).join(
          ', '
        )}`
      );
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error updating system variables:', error);
      return false;
    } finally {
      client.release();
    }
  }

  // Actualizar una variable específica del sistema
  public async updateSystemVariable(key: string, value: string): Promise<boolean> {
    return this.updateSystemVariables({ [key]: value });
  }

  // Validar valor de variable del sistema
  private validateSystemVariable(key: string, value: string): boolean {
    if (!value || value.trim().length === 0) {
      return false;
    }

    switch (key) {
      case 'email_soporte':
      case 'email_empresa':
        // Validación básica de email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(value);

      case 'sitio_web':
        // Validación básica de URL
        try {
          new URL(value);
          return true;
        } catch {
          return false;
        }

      case 'telefono_soporte':
      case 'telefono_empresa':
        // Validación básica de teléfono (debe contener al menos algunos dígitos)
        const phoneRegex = /\d{7,}/; // Al menos 7 dígitos
        return phoneRegex.test(value.replace(/[^\d]/g, ''));

      default:
        // Para otras variables, solo verificar que no estén vacías
        return value.trim().length > 0;
    }
  }

  // Obtener descripción por defecto para variables del sistema
  private getSystemVariableDescription(key: string): string {
    const descriptions: Record<string, string> = {
      empresa: 'Nombre de la empresa',
      sitio_web: 'URL del sitio web de la empresa',
      telefono_soporte: 'Número de teléfono de soporte al cliente',
      email_soporte: 'Email de soporte al cliente',
      telefono_empresa: 'Número de teléfono principal de la empresa',
      direccion: 'Dirección física de la empresa',
      horario_atencion: 'Horario de atención al cliente',
    };

    return descriptions[key] || `Variable del sistema: ${key}`;
  }

  // Reemplazar variables del sistema en texto (para usar en templates)
  public async replaceSystemVariables(text: string): Promise<string> {
    if (!text || !text.includes('{{')) {
      return text;
    }

    const variables = await this.getSystemVariables();
    let result = text;

    // Reemplazar todas las variables encontradas
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      result = result.replace(new RegExp(placeholder, 'g'), value);
    }

    return result;
  }

  // Limpiar cache de variables del sistema (útil para tests)
  public clearSystemVariablesCache(): void {
    this.systemVariablesCache = {};
    this.cacheTimestamp = 0;
    logger.debug('🧹 System variables cache cleared');
  }
}

// Exportar instancia singleton
export default new DatabaseService();
