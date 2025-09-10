/**
 * @fileoverview Lead Repository Implementation
 * Handles all database operations related to leads
 */

import { BaseRepository } from './BaseRepository';
import { Lead, ILeadRepository, IDatabaseConnection } from './types';
import { logger } from '../../utils/logger';
import PhoneNumberService from '../PhoneNumberService';

export class LeadRepository extends BaseRepository implements ILeadRepository {
  constructor(connection?: IDatabaseConnection) {
    super(connection);
  }

  /**
   * Create leads table if it doesn't exist
   */
  protected async createTablesIfNotExists(): Promise<void> {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS leads (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255),
        phone VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(255),
        tags TEXT[],
        status VARCHAR(20) DEFAULT 'NUEVO' CHECK (status IN ('NUEVO', 'CONTACTADO', 'QUALIFIED', 'PERDIDO', 'GANADO')),
        "moodScore" INTEGER CHECK ("moodScore" >= 0 AND "moodScore" <= 100),
        "lastContact" TIMESTAMP,
        "assignedTo" VARCHAR(255),
        source VARCHAR(100) DEFAULT 'whatsapp',
        "whatsappAuthorized" BOOLEAN DEFAULT false,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Create indexes for performance
      CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads (phone);
      CREATE INDEX IF NOT EXISTS idx_leads_status ON leads (status);
      CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads ("createdAt");
    `;

    try {
      await this.executeQuery(createTableSQL, [], 'create-leads-table');
      logger.info('✅ Leads table and indexes created/verified');
    } catch (error) {
      logger.error('❌ Failed to create leads table:', error);
      throw error;
    }
  }

  /**
   * Find all leads
   */
  public async findAll(): Promise<Lead[]> {
    try {
      const result = await this.executeQuery<Lead>(
        'SELECT * FROM leads ORDER BY "createdAt" DESC',
        [],
        'find-all-leads'
      );

      return result.rows.map(this.mapDatabaseRowToLead);
    } catch (error) {
      logger.error('Error fetching all leads:', error);
      return [];
    }
  }

  /**
   * Find lead by ID
   */
  public async findById(id: string): Promise<Lead | null> {
    try {
      this.validateRequiredFields({ id }, ['id']);

      const result = await this.executeQuery<Lead>(
        'SELECT * FROM leads WHERE id = $1',
        [id],
        'find-lead-by-id'
      );

      if (result.rowCount === 0) {
        return null;
      }

      return this.mapDatabaseRowToLead(result.rows[0]);
    } catch (error) {
      logger.error(`Error finding lead by ID ${id}:`, error);
      return null;
    }
  }

  /**
   * Find lead by phone number (with phone number equivalence check)
   */
  public async findByPhone(phone: string): Promise<Lead | null> {
    try {
      this.validateRequiredFields({ phone }, ['phone']);

      // Get all leads to check for equivalent phone numbers
      const allLeads = await this.findAll();

      // Use PhoneNumberService to find equivalent phone numbers
      for (const lead of allLeads) {
        if (lead.phone && PhoneNumberService.arePhoneNumbersEquivalent(phone, lead.phone)) {
          logger.info(
            `📞 Found existing lead with equivalent phone number: ${lead.phone} ≈ ${phone}`
          );
          return lead;
        }
      }

      return null;
    } catch (error) {
      logger.error(`Error finding lead by phone ${phone}:`, error);
      return null;
    }
  }

  /**
   * Create a new lead
   */
  public async create(leadData: Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>): Promise<Lead> {
    try {
      this.validateRequiredFields(leadData, ['phone', 'source']);

      // Normalize phone number
      const normalizedPhone = PhoneNumberService.normalizePhoneNumber(leadData.phone);

      // Check for existing lead with same phone
      const existingLead = await this.findByPhone(normalizedPhone);
      if (existingLead) {
        logger.warn(
          `⚠️ Lead with phone number ${leadData.phone} (normalized: ${normalizedPhone}) already exists with ID: ${existingLead.id}`
        );
        throw new Error(
          `Duplicate phone number: A lead with phone ${leadData.phone} already exists`
        );
      }

      const sanitizedData = this.sanitizeData({
        ...leadData,
        phone: normalizedPhone,
        status: leadData.status || 'NUEVO',
        tags: JSON.stringify(leadData.tags || []),
      });

      const insertSQL = `
        INSERT INTO leads (name, phone, email, tags, status, "moodScore", "lastContact", "assignedTo", source, "whatsappAuthorized")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `;

      const values = [
        sanitizedData.name || null,
        sanitizedData.phone,
        sanitizedData.email || null,
        sanitizedData.tags || '[]',
        sanitizedData.status,
        sanitizedData.moodScore || null,
        sanitizedData.lastContact || null,
        sanitizedData.assignedTo || null,
        sanitizedData.source,
        sanitizedData.whatsappAuthorized || false,
      ];

      const result = await this.executeQuery<Lead>(insertSQL, values, 'create-lead');

      if (result.rowCount === 0) {
        throw new Error('Failed to create lead');
      }

      const newLead = this.mapDatabaseRowToLead(result.rows[0]);
      logger.info(`✅ Lead created successfully with ID: ${newLead.id}`);

      return newLead;
    } catch (error) {
      logger.error('Error creating lead:', error);
      throw error;
    }
  }

  /**
   * Update WhatsApp authorization for a lead
   */
  public async updateWhatsAppAuth(phone: string, authorized: boolean): Promise<boolean> {
    try {
      this.validateRequiredFields({ phone }, ['phone']);

      const lead = await this.findByPhone(phone);
      if (!lead) {
        logger.warn(`Lead with phone ${phone} not found for WhatsApp auth update`);
        return false;
      }

      const result = await this.executeQuery(
        `UPDATE leads 
         SET "whatsappAuthorized" = $1, "updatedAt" = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING id`,
        [authorized, lead.id],
        'update-whatsapp-auth'
      );

      const success = result.rowCount > 0;

      if (success) {
        logger.info(`✅ WhatsApp authorization updated for lead ${lead.id}: ${authorized}`);
      } else {
        logger.warn(`⚠️ Failed to update WhatsApp authorization for lead ${lead.id}`);
      }

      return success;
    } catch (error) {
      logger.error(`Error updating WhatsApp auth for phone ${phone}:`, error);
      return false;
    }
  }

  /**
   * Update lead data
   */
  public async update(id: string, data: Partial<Lead>): Promise<Lead | null> {
    try {
      this.validateRequiredFields({ id }, ['id']);

      // Remove fields that shouldn't be updated directly
      const { id: _, createdAt, ...updateData } = data;

      if (Object.keys(updateData).length === 0) {
        logger.warn('No valid fields to update');
        return null;
      }

      // Build dynamic UPDATE query
      const updateFields: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      for (const [field, value] of Object.entries(updateData)) {
        if (value !== undefined) {
          updateFields.push(`"${field}" = $${paramIndex++}`);

          // Handle arrays for tags
          if (field === 'tags' && Array.isArray(value)) {
            values.push(JSON.stringify(value));
          } else {
            values.push(value);
          }
        }
      }

      // Add updatedAt timestamp
      updateFields.push(`"updatedAt" = CURRENT_TIMESTAMP`);
      values.push(id); // for WHERE clause

      const updateSQL = `
        UPDATE leads 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `;

      const result = await this.executeQuery<Lead>(updateSQL, values, 'update-lead');

      if (result.rowCount === 0) {
        logger.warn(`Lead with ID ${id} not found for update`);
        return null;
      }

      const updatedLead = this.mapDatabaseRowToLead(result.rows[0]);
      logger.info(`✅ Lead ${id} updated successfully`);

      return updatedLead;
    } catch (error) {
      logger.error(`Error updating lead ${id}:`, error);
      return null;
    }
  }

  /**
   * Delete a lead
   */
  public async delete(id: string): Promise<boolean> {
    try {
      this.validateRequiredFields({ id }, ['id']);

      const result = await this.executeQuery(
        'DELETE FROM leads WHERE id = $1',
        [id],
        'delete-lead'
      );

      const success = result.rowCount > 0;

      if (success) {
        logger.info(`✅ Lead ${id} deleted successfully`);
      } else {
        logger.warn(`⚠️ Lead ${id} not found for deletion`);
      }

      return success;
    } catch (error) {
      logger.error(`Error deleting lead ${id}:`, error);
      return false;
    }
  }

  /**
   * Get repository metrics
   */
  public override async getMetrics(): Promise<Record<string, any>> {
    const baseMetrics = await super.getMetrics();

    try {
      const totalResult = await this.executeQuery(
        'SELECT COUNT(*) as total FROM leads',
        [],
        'count-total-leads'
      );

      const statusResult = await this.executeQuery(
        'SELECT status, COUNT(*) as count FROM leads GROUP BY status',
        [],
        'count-leads-by-status'
      );

      const recentResult = await this.executeQuery(
        'SELECT COUNT(*) as recent FROM leads WHERE "createdAt" > NOW() - INTERVAL \'30 days\'',
        [],
        'count-recent-leads'
      );

      return {
        ...baseMetrics,
        totalLeads: totalResult.rows[0]?.total || 0,
        recentLeads: recentResult.rows[0]?.recent || 0,
        leadsByStatus: statusResult.rows.reduce((acc: any, row: any) => {
          acc[row.status] = parseInt(row.count);
          return acc;
        }, {}),
      };
    } catch (error) {
      logger.error('Error getting lead repository metrics:', error);
      return baseMetrics;
    }
  }

  /**
   * Map database row to Lead object
   */
  private mapDatabaseRowToLead(row: any): Lead {
    return {
      id: row.id,
      name: row.name || undefined,
      phone: row.phone,
      email: row.email || undefined,
      tags: row.tags ? (typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags) : [],
      status: row.status,
      moodScore: row.moodScore || undefined,
      lastContact: row.lastContact ? new Date(row.lastContact) : undefined,
      assignedTo: row.assignedTo || undefined,
      source: row.source,
      whatsappAuthorized: row.whatsappAuthorized || false,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }
}
