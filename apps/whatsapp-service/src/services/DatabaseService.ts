import { Pool, PoolClient } from 'pg';
import { logger } from '../utils/logger';

// Interfaz para datos de conversación
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

// Interfaz para historial de conversación
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

// Interfaz para leads (basada en la estructura real de Supabase)
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

class DatabaseService {
  private pool: Pool | null = null;

  constructor() {
    this.initializePool();
  }

  private initializePool(): void {
    try {
      if (!process.env.DATABASE_URL) {
        logger.warn('DATABASE_URL no está configurado, funcionando sin persistencia de base de datos');
        return;
      }

      this.pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });

      this.pool.on('error', (err) => {
        logger.error('Error en el pool de conexiones PostgreSQL:', err);
      });

      logger.info('Pool de conexiones PostgreSQL inicializado');
    } catch (error) {
      logger.error('Error inicializando pool de base de datos:', error);
    }
  }

  // Crear tabla si no existe
  public async initializeTable(): Promise<void> {
    if (!this.pool) {
      logger.warn('No hay conexión a base de datos disponible');
      return;
    }

    const createTableQuery = `
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

      -- Crear índices para consultas frecuentes
      CREATE INDEX IF NOT EXISTS idx_whatsapp_phone ON whatsapp_conversations(phone_number);
      CREATE INDEX IF NOT EXISTS idx_whatsapp_session ON whatsapp_conversations(session_id);
      CREATE INDEX IF NOT EXISTS idx_whatsapp_created ON whatsapp_conversations(created_at);
    `;

    try {
      await this.pool.query(createTableQuery);
      logger.info('Tabla whatsapp_conversations verificada/creada correctamente');
    } catch (error) {
      logger.error('Error creando tabla whatsapp_conversations:', error);
    }
  }

  // Guardar conversación
  public async saveConversation(data: ConversationData): Promise<string | null> {
    if (!this.pool) {
      logger.warn('No hay conexión a base de datos, conversación no guardada');
      return null;
    }

    const query = `
      INSERT INTO whatsapp_conversations (
        session_id, phone_number, contact_name, message_text, response_text,
        message_type, intent, sentiment, ai_provider, tokens_used, is_from_user
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id;
    `;

    const values = [
      data.sessionId,
      data.phoneNumber,
      data.contactName || null,
      data.messageText || null,
      data.responseText || null,
      data.messageType || 'text',
      data.intent || null,
      data.sentiment || null,
      data.aiProvider || null,
      data.tokensUsed || 0,
      data.isFromUser !== undefined ? data.isFromUser : true
    ];

    try {
      const result = await this.pool.query(query, values);
      const conversationId = result.rows[0]?.id;
      
      logger.info('Conversación guardada:', {
        id: conversationId,
        phoneNumber: data.phoneNumber,
        sessionId: data.sessionId
      });
      
      return conversationId;
    } catch (error) {
      logger.error('Error guardando conversación:', error);
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
        updatedAt: new Date(row.updated_at)
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
            content: row.message_text
          });
        }
        if (row.response_text && !row.is_from_user) {
          context.push({
            role: 'assistant',
            content: row.response_text
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
      return { totalConversations: 0, uniqueContacts: 0, averageResponseTime: 0 };
    }

    let query = `
      SELECT 
        COUNT(*) as total_conversations,
        COUNT(DISTINCT phone_number) as unique_contacts,
        COUNT(CASE WHEN ai_provider IS NOT NULL THEN 1 END) as ai_responses,
        AVG(tokens_used) as avg_tokens
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
        averageTokens: parseFloat(stats.avg_tokens) || 0
      };
    } catch (error) {
      logger.error('Error obteniendo estadísticas:', error);
      return { totalConversations: 0, uniqueContacts: 0, aiResponses: 0, averageTokens: 0 };
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
        updatedAt: new Date(row.updated_at)
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
              id, name, phone, email, tags, status, "moodScore", 
              "lastContact", "assignedTo", source, whatsapp_authorized,
              "createdAt", "updatedAt"
            FROM leads 
            ORDER BY "createdAt" DESC;
          `;
          
          const result = await this.pool.query(query);
          const realLeads = result.rows.map(row => ({
            id: row.id,
            name: row.name,
            phone: row.phone,
            email: row.email,
            tags: row.tags,
            status: row.status,
            moodScore: row.moodScore,
            lastContact: row.lastContact ? new Date(row.lastContact) : undefined,
            assignedTo: row.assignedTo,
            source: row.source,
            whatsappAuthorized: row.whatsapp_authorized,
            createdAt: new Date(row.createdAt),
            updatedAt: new Date(row.updatedAt)
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
        updatedAt: new Date()
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
        updatedAt: new Date()
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
        updatedAt: new Date()
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
        updatedAt: new Date()
      }
    ];
    
    logger.info(`🔧 Usando ${mockLeads.length} leads mockeados para desarrollo`);
    return mockLeads;
  }
}

// Exportar instancia singleton
export default new DatabaseService();
