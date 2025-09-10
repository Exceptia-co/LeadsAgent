/**
 * @fileoverview Repository Factory - Simplified Version
 * Creates and manages repository instances with working stubs
 */

import {
  IRepositoryFactory,
  ILeadRepository,
  IConversationRepository,
  IDatabaseConnection,
} from './types';
import { LeadRepository } from './LeadRepository';
import { ConversationRepository } from './ConversationRepository';
import { KnowledgeBaseRepository } from './KnowledgeBaseRepository';
import { AIConfigRepository } from './AIConfigRepository';
import { TrainingRepository } from './TrainingRepository';
import { WhitelistLogRepository } from './WhitelistLogRepository';
import { DatabaseConnectionAdapter } from './DatabaseConnectionAdapter';
import { logger } from '../../utils/logger';

export class RepositoryFactory {
  private connection: IDatabaseConnection;
  private leadRepository?: ILeadRepository;
  private conversationRepository?: IConversationRepository;
  private knowledgeBaseRepository?: KnowledgeBaseRepository;
  private aiConfigRepository?: AIConfigRepository;
  private trainingRepository?: TrainingRepository;
  private whitelistLogRepository?: WhitelistLogRepository;

  constructor(pgPool: any) {
    this.connection = new DatabaseConnectionAdapter(pgPool);
  }

  public async initialize(): Promise<void> {
    logger.info('🏭 Initializing Repository Factory...');

    const connectionOk = await this.connection.testConnection();
    if (!connectionOk) {
      throw new Error('Database connection test failed');
    }

    logger.info('✅ Repository Factory initialized successfully');
  }

  public createLeadRepository(): ILeadRepository {
    if (!this.leadRepository) {
      this.leadRepository = new LeadRepository(this.connection);
    }
    return this.leadRepository;
  }

  public createConversationRepository(): IConversationRepository {
    if (!this.conversationRepository) {
      this.conversationRepository = new ConversationRepository(this.connection);
    }
    return this.conversationRepository;
  }

  public createKnowledgeBaseRepository(): KnowledgeBaseRepository {
    if (!this.knowledgeBaseRepository) {
      this.knowledgeBaseRepository = new KnowledgeBaseRepository(this.connection);
    }
    return this.knowledgeBaseRepository;
  }

  public createAIConfigRepository(): AIConfigRepository {
    if (!this.aiConfigRepository) {
      this.aiConfigRepository = new AIConfigRepository(this.connection);
    }
    return this.aiConfigRepository;
  }

  public createTrainingRepository(): TrainingRepository {
    if (!this.trainingRepository) {
      this.trainingRepository = new TrainingRepository(this.connection);
    }
    return this.trainingRepository;
  }

  public createWhitelistLogRepository(): WhitelistLogRepository {
    if (!this.whitelistLogRepository) {
      this.whitelistLogRepository = new WhitelistLogRepository(this.connection);
    }
    return this.whitelistLogRepository;
  }

  public async initializeAllRepositories(): Promise<void> {
    logger.info('🔄 Initializing all repositories...');

    try {
      const leadRepo = this.createLeadRepository();
      const conversationRepo = this.createConversationRepository();
      const knowledgeBaseRepo = this.createKnowledgeBaseRepository();
      const aiConfigRepo = this.createAIConfigRepository();
      const trainingRepo = this.createTrainingRepository();
      const whitelistLogRepo = this.createWhitelistLogRepository();

      await Promise.all([
        leadRepo.initialize(),
        conversationRepo.initialize(),
        knowledgeBaseRepo.initialize(),
        aiConfigRepo.initialize(),
        trainingRepo.initialize(),
        whitelistLogRepo.initialize(),
      ]);

      logger.info('✅ All repositories initialized successfully');
    } catch (error) {
      logger.error('❌ Failed to initialize repositories:', error);
      throw error;
    }
  }

  public async closeAllConnections(): Promise<void> {
    logger.info('🔌 Closing all repository connections...');

    try {
      const repositories = [
        this.leadRepository,
        this.conversationRepository,
        this.knowledgeBaseRepository,
        this.aiConfigRepository,
        this.trainingRepository,
        this.whitelistLogRepository,
      ].filter(Boolean);

      await Promise.all(repositories.map(repo => repo!.close()));
      await this.connection.close();

      logger.info('✅ All repository connections closed');
    } catch (error) {
      logger.error('❌ Error closing repository connections:', error);
    }
  }

  public getConnection(): IDatabaseConnection {
    return this.connection;
  }
}
