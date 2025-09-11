/**
 * @fileoverview Interface abstraction to break circular dependencies
 * This interface separates data persistence logic from business logic
 */

import type { TrainingInteraction, WhatsAppSession } from '../types';

/**
 * Interface for data persistence operations
 * Used to break circular dependency between services
 */
export interface IDataPersistence {
  // Training interaction methods
  saveTrainingInteraction(interaction: TrainingInteraction): Promise<string | null>;
  getTrainingInteractions(filters?: {
    phoneNumber?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<TrainingInteraction[]>;
  
  // Session methods
  getAllSessions(): Promise<WhatsAppSession[]>;
  getSessionById(sessionId: string): Promise<WhatsAppSession | null>;
  
  // Analysis methods
  getFrequentPatterns(limit?: number): Promise<Array<{
    pattern: string;
    frequency: number;
    averageSuccessScore: number;
    lastSeen: Date;
  }>>;
}
