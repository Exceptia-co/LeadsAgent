/**
 * @fileoverview ContactManager - Handles WhatsApp contact operations
 * Part of WhatsAppServiceSimple refactoring following SRP
 */

import type { Contact, Chat, GroupChat } from 'whatsapp-web.js';
import { logger } from '../../utils/logger';
import { LogExecutionTime, SafeExecutor, isSuccess, isFailure } from '../../utils/decorators';
import { ErrorFactory } from '../../errors';
import { eventBus } from '../../events/EventBus';
import { serviceLocator } from '../../core/ServiceLocator';
import type { IContactManager, WhatsAppContact, ContactInfo, ChatInfo, Result } from '../../types';

/**
 * ContactManager handles all contact and chat-related operations
 * Responsible for retrieving and managing WhatsApp contacts and chats
 */
export class ContactManager implements IContactManager {
  private contactCache: Map<string, Map<string, WhatsAppContact>> = new Map();
  private chatCache: Map<string, Map<string, ChatInfo>> = new Map();

  /**
   * Get contact information by phone number
   */
  @LogExecutionTime({ operationId: 'get-contact' })
  public async getContact(sessionId: string, phoneNumber: string): Promise<WhatsAppContact | null> {
    return SafeExecutor.execute(
      async () => {
        // Check cache first
        const sessionCache = this.contactCache.get(sessionId);
        if (sessionCache?.has(phoneNumber)) {
          return sessionCache.get(phoneNumber);
        }

        logger.info(`👤 Getting contact info for ${phoneNumber} in session ${sessionId}`);

        // Get session manager to access client
        const sessionManager = serviceLocator.get('sessionManager');
        if (!sessionManager) {
          throw ErrorFactory.whatsapp(
            'Session manager not available',
            'SERVICE_UNAVAILABLE',
            sessionId
          );
        }

        const client = sessionManager.getClient(sessionId);
        if (!client) {
          throw ErrorFactory.session(`No active client for session ${sessionId}`, sessionId);
        }

        // Normalize phone number
        const normalizedNumber = this.normalizePhoneNumber(phoneNumber);

        // Get contact from WhatsApp
        const contact = await client.getContactById(normalizedNumber);
        if (!contact) {
          logger.warn(`⚠️ Contact not found: ${normalizedNumber}`);
          return null;
        }

        // Convert to our format
        const whatsAppContact = await this.convertContact(contact);

        // Cache the result
        this.cacheContact(sessionId, phoneNumber, whatsAppContact);

        logger.debug(
          `✅ Contact retrieved: ${whatsAppContact.name || whatsAppContact.phoneNumber}`
        );
        return whatsAppContact;
      },
      {
        operationName: 'get-contact',
        context: { sessionId, phoneNumber },
        timeout: 15000,
      }
    ).then(result => {
      if (isFailure(result)) {
        logger.error(`❌ Failed to get contact ${phoneNumber}:`, result.error);
        return null; // Return null instead of throwing to allow graceful handling
      }
      return result.data;
    });
  }

  /**
   * Get all contacts for a session
   */
  @LogExecutionTime({ operationId: 'get-all-contacts' })
  public async getAllContacts(sessionId: string): Promise<WhatsAppContact[]> {
    return SafeExecutor.execute(
      async () => {
        logger.info(`👥 Getting all contacts for session ${sessionId}`);

        // Get session manager to access client
        const sessionManager = serviceLocator.get('sessionManager');
        if (!sessionManager) {
          throw ErrorFactory.whatsapp(
            'Session manager not available',
            'SERVICE_UNAVAILABLE',
            sessionId
          );
        }

        const client = sessionManager.getClient(sessionId);
        if (!client) {
          throw ErrorFactory.session(`No active client for session ${sessionId}`, sessionId);
        }

        // Get all contacts from WhatsApp
        const contacts = await client.getContacts();

        // Convert to our format
        const whatsAppContacts: WhatsAppContact[] = [];
        for (const contact of contacts) {
          try {
            const whatsAppContact = await this.convertContact(contact);
            whatsAppContacts.push(whatsAppContact);

            // Cache the contact
            this.cacheContact(sessionId, contact.id._serialized, whatsAppContact);
          } catch (error) {
            logger.warn(`⚠️ Failed to convert contact ${contact.id._serialized}:`, error);
          }
        }

        logger.info(`✅ Retrieved ${whatsAppContacts.length} contacts for session ${sessionId}`);
        return whatsAppContacts;
      },
      {
        operationName: 'get-all-contacts',
        context: { sessionId },
        timeout: 30000,
      }
    ).then(result => {
      if (isFailure(result)) {
        logger.error(`❌ Failed to get all contacts:`, result.error);
        throw result.error;
      }
      return result.data;
    });
  }

  /**
   * Get chat information
   */
  @LogExecutionTime({ operationId: 'get-chat' })
  public async getChat(sessionId: string, chatId: string): Promise<ChatInfo | null> {
    return SafeExecutor.execute(
      async () => {
        // Check cache first
        const sessionCache = this.chatCache.get(sessionId);
        if (sessionCache?.has(chatId)) {
          return sessionCache.get(chatId);
        }

        logger.info(`💬 Getting chat info for ${chatId} in session ${sessionId}`);

        // Get session manager to access client
        const sessionManager = serviceLocator.get('sessionManager');
        if (!sessionManager) {
          throw ErrorFactory.whatsapp(
            'Session manager not available',
            'SERVICE_UNAVAILABLE',
            sessionId
          );
        }

        const client = sessionManager.getClient(sessionId);
        if (!client) {
          throw ErrorFactory.session(`No active client for session ${sessionId}`, sessionId);
        }

        // Get chat from WhatsApp
        const chat = await client.getChatById(chatId);
        if (!chat) {
          logger.warn(`⚠️ Chat not found: ${chatId}`);
          return null;
        }

        // Convert to our format
        const chatInfo = await this.convertChat(chat);

        // Cache the result
        this.cacheChat(sessionId, chatId, chatInfo);

        logger.debug(`✅ Chat retrieved: ${chatInfo.name || chatInfo.id}`);
        return chatInfo;
      },
      {
        operationName: 'get-chat',
        context: { sessionId, chatId },
        timeout: 15000,
      }
    ).then(result => {
      if (isFailure(result)) {
        logger.error(`❌ Failed to get chat ${chatId}:`, result.error);
        return null; // Return null instead of throwing to allow graceful handling
      }
      return result.data;
    });
  }

  /**
   * Get all chats for a session
   */
  @LogExecutionTime({ operationId: 'get-all-chats' })
  public async getAllChats(sessionId: string): Promise<ChatInfo[]> {
    return SafeExecutor.execute(
      async () => {
        logger.info(`💬 Getting all chats for session ${sessionId}`);

        // Get session manager to access client
        const sessionManager = serviceLocator.get('sessionManager');
        if (!sessionManager) {
          throw ErrorFactory.whatsapp(
            'Session manager not available',
            'SERVICE_UNAVAILABLE',
            sessionId
          );
        }

        const client = sessionManager.getClient(sessionId);
        if (!client) {
          throw ErrorFactory.session(`No active client for session ${sessionId}`, sessionId);
        }

        // Get all chats from WhatsApp
        const chats = await client.getChats();

        // Convert to our format
        const chatInfos: ChatInfo[] = [];
        for (const chat of chats) {
          try {
            const chatInfo = await this.convertChat(chat);
            chatInfos.push(chatInfo);

            // Cache the chat
            this.cacheChat(sessionId, chat.id._serialized, chatInfo);
          } catch (error) {
            logger.warn(`⚠️ Failed to convert chat ${chat.id._serialized}:`, error);
          }
        }

        logger.info(`✅ Retrieved ${chatInfos.length} chats for session ${sessionId}`);
        return chatInfos;
      },
      {
        operationName: 'get-all-chats',
        context: { sessionId },
        timeout: 45000,
      }
    ).then(result => {
      if (isFailure(result)) {
        logger.error(`❌ Failed to get all chats:`, result.error);
        throw result.error;
      }
      return result.data;
    });
  }

  /**
   * Search contacts by name or phone number
   */
  @LogExecutionTime({ operationId: 'search-contacts' })
  public async searchContacts(sessionId: string, query: string): Promise<WhatsAppContact[]> {
    return SafeExecutor.execute(
      async () => {
        logger.info(`🔍 Searching contacts for "${query}" in session ${sessionId}`);

        // Get all contacts first
        const allContacts = await this.getAllContacts(sessionId);

        // Filter contacts based on query
        const filteredContacts = allContacts.filter(contact => {
          const searchText = query.toLowerCase();

          return (
            contact.name?.toLowerCase().includes(searchText) ||
            contact.phoneNumber.includes(searchText) ||
            contact.formattedName?.toLowerCase().includes(searchText)
          );
        });

        logger.info(`✅ Found ${filteredContacts.length} contacts matching "${query}"`);
        return filteredContacts;
      },
      {
        operationName: 'search-contacts',
        context: { sessionId, query },
        timeout: 30000,
      }
    ).then(result => {
      if (isFailure(result)) {
        logger.error(`❌ Failed to search contacts:`, result.error);
        throw result.error;
      }
      return result.data;
    });
  }

  /**
   * Check if a number is registered on WhatsApp
   */
  @LogExecutionTime({ operationId: 'check-number-registered' })
  public async isNumberRegistered(sessionId: string, phoneNumber: string): Promise<boolean> {
    return SafeExecutor.execute(
      async () => {
        logger.info(`📞 Checking if ${phoneNumber} is registered on WhatsApp`);

        // Get session manager to access client
        const sessionManager = serviceLocator.get('sessionManager');
        if (!sessionManager) {
          throw ErrorFactory.whatsapp(
            'Session manager not available',
            'SERVICE_UNAVAILABLE',
            sessionId
          );
        }

        const client = sessionManager.getClient(sessionId);
        if (!client) {
          throw ErrorFactory.session(`No active client for session ${sessionId}`, sessionId);
        }

        // Normalize phone number
        const normalizedNumber = this.normalizePhoneNumber(phoneNumber);

        // Check if number is registered
        const isRegistered = await client.isRegisteredUser(normalizedNumber);

        logger.debug(
          `✅ Registration check for ${phoneNumber}: ${isRegistered ? 'registered' : 'not registered'}`
        );
        return isRegistered;
      },
      {
        operationName: 'check-number-registered',
        context: { sessionId, phoneNumber },
        timeout: 10000,
      }
    ).then(result => {
      if (isFailure(result)) {
        logger.error(`❌ Failed to check number registration:`, result.error);
        return false; // Default to false on error
      }
      return result.data;
    });
  }

  /**
   * Get profile picture URL for a contact
   */
  @LogExecutionTime({ operationId: 'get-profile-picture' })
  public async getProfilePicture(sessionId: string, phoneNumber: string): Promise<string | null> {
    return SafeExecutor.execute(
      async () => {
        logger.info(`🖼️ Getting profile picture for ${phoneNumber}`);

        // Get session manager to access client
        const sessionManager = serviceLocator.get('sessionManager');
        if (!sessionManager) {
          throw ErrorFactory.whatsapp(
            'Session manager not available',
            'SERVICE_UNAVAILABLE',
            sessionId
          );
        }

        const client = sessionManager.getClient(sessionId);
        if (!client) {
          throw ErrorFactory.session(`No active client for session ${sessionId}`, sessionId);
        }

        // Normalize phone number
        const normalizedNumber = this.normalizePhoneNumber(phoneNumber);

        // Get profile picture URL
        const pictureUrl = await client.getProfilePicUrl(normalizedNumber);

        logger.debug(`✅ Profile picture retrieved for ${phoneNumber}`);
        return pictureUrl || null;
      },
      {
        operationName: 'get-profile-picture',
        context: { sessionId, phoneNumber },
        timeout: 10000,
      }
    ).then(result => {
      if (isFailure(result)) {
        logger.warn(`⚠️ Failed to get profile picture:`, result.error);
        return null; // Return null on error to allow graceful handling
      }
      return result.data;
    });
  }

  /**
   * Convert WhatsApp Web.js Contact to our format
   */
  private async convertContact(contact: Contact): Promise<WhatsAppContact> {
    let profilePicUrl: string | null = null;
    try {
      // Try to get profile pic URL if available
      if (typeof (contact as any).getProfilePicUrl === 'function') {
        profilePicUrl = await (contact as any).getProfilePicUrl();
      }
    } catch (error) {
      // Ignore errors when getting profile pic URL
      profilePicUrl = null;
    }

    return {
      id: contact.id._serialized,
      phoneNumber: contact.number,
      name: contact.name || contact.pushname || null,
      formattedName: (contact as any).formattedName || null,
      shortName: (contact as any).shortName || null,
      pushName: contact.pushname || null,
      profilePicUrl,
      isMe: contact.isMe,
      isUser: contact.isUser,
      isGroup: contact.isGroup,
      isWAContact: contact.isWAContact,
      isBusiness: contact.isBusiness || false,
      labels: contact.labels || [],
    };
  }

  /**
   * Convert WhatsApp Web.js Chat to our format
   */
  private async convertChat(chat: Chat): Promise<ChatInfo> {
    const contact = await chat.getContact();
    let profilePicUrl: string | null = null;

    try {
      // Try to get profile pic URL if available
      if (typeof (chat as any).getProfilePicUrl === 'function') {
        profilePicUrl = await (chat as any).getProfilePicUrl();
      }
    } catch (error) {
      // Ignore errors when getting profile pic URL
      profilePicUrl = null;
    }

    const basicInfo: ChatInfo = {
      id: chat.id._serialized,
      name: chat.name,
      isGroup: chat.isGroup,
      isReadOnly: chat.isReadOnly,
      unreadCount: chat.unreadCount,
      timestamp: chat.timestamp,
      profilePicUrl,
      archived: chat.archived,
      pinned: chat.pinned,
      muted: chat.isMuted,
    };

    // Add group-specific information if it's a group chat
    if (chat.isGroup && 'groupMetadata' in chat) {
      try {
        // Cast to unknown first, then to the type we expect
        const groupChat = chat as unknown as GroupChat;
        const groupMetadata = (groupChat as any).groupMetadata;

        if (groupMetadata) {
          return {
            ...basicInfo,
            groupInfo: {
              description: groupMetadata.desc || null,
              owner: groupMetadata.owner?._serialized || null,
              creation: groupMetadata.creation || 0,
              participants:
                groupMetadata.participants?.map((p: any) => ({
                  id: p.id._serialized,
                  isAdmin: p.isAdmin,
                  isSuperAdmin: p.isSuperAdmin,
                })) || [],
              inviteCode: null, // This would require additional API call
            },
          };
        }
      } catch (error) {
        logger.warn('Error processing group metadata:', error);
      }
    }

    // Add individual contact information
    if (contact) {
      return {
        ...basicInfo,
        contactInfo: await this.convertContact(contact),
      };
    }

    return basicInfo;
  }

  /**
   * Cache contact information
   */
  private cacheContact(sessionId: string, phoneNumber: string, contact: WhatsAppContact): void {
    let sessionCache = this.contactCache.get(sessionId);
    if (!sessionCache) {
      sessionCache = new Map();
      this.contactCache.set(sessionId, sessionCache);
    }

    sessionCache.set(phoneNumber, contact);
    sessionCache.set(contact.id, contact); // Also cache by WhatsApp ID
  }

  /**
   * Cache chat information
   */
  private cacheChat(sessionId: string, chatId: string, chat: ChatInfo): void {
    let sessionCache = this.chatCache.get(sessionId);
    if (!sessionCache) {
      sessionCache = new Map();
      this.chatCache.set(sessionId, sessionCache);
    }

    sessionCache.set(chatId, chat);
  }

  /**
   * Normalize phone number for WhatsApp format
   */
  private normalizePhoneNumber(phoneNumber: string): string {
    // Remove all non-digit characters
    const cleaned = phoneNumber.replace(/\D/g, '');

    // If number doesn't end with @c.us, add it
    if (!phoneNumber.includes('@c.us')) {
      return `${cleaned}@c.us`;
    }

    return phoneNumber;
  }

  /**
   * Clear contact cache for a session
   */
  public clearContactCache(sessionId: string): void {
    this.contactCache.delete(sessionId);
    this.chatCache.delete(sessionId);
    logger.info(`🧹 Cleared contact cache for session ${sessionId}`);
  }

  /**
   * Get cached contact count for a session
   */
  public getCachedContactCount(sessionId: string): number {
    const sessionCache = this.contactCache.get(sessionId);
    return sessionCache ? sessionCache.size : 0;
  }

  /**
   * Get cached chat count for a session
   */
  public getCachedChatCount(sessionId: string): number {
    const sessionCache = this.chatCache.get(sessionId);
    return sessionCache ? sessionCache.size : 0;
  }

  /**
   * Refresh contact cache for a session
   */
  @LogExecutionTime({ operationId: 'refresh-contact-cache' })
  public async refreshContactCache(sessionId: string): Promise<void> {
    return SafeExecutor.execute(
      async () => {
        logger.info(`🔄 Refreshing contact cache for session ${sessionId}`);

        // Clear existing cache
        this.clearContactCache(sessionId);

        // Reload all contacts to rebuild cache
        await this.getAllContacts(sessionId);

        logger.info(`✅ Contact cache refreshed for session ${sessionId}`);
      },
      {
        operationName: 'refresh-contact-cache',
        context: { sessionId },
        timeout: 45000,
      }
    ).then(result => {
      if (isFailure(result)) {
        logger.error(`❌ Failed to refresh contact cache:`, result.error);
        throw result.error;
      }
    });
  }

  /**
   * Block a contact
   */
  @LogExecutionTime({ operationId: 'block-contact' })
  public async blockContact(sessionId: string, phoneNumber: string): Promise<boolean> {
    return SafeExecutor.execute(
      async () => {
        logger.info(`🚫 Blocking contact ${phoneNumber} in session ${sessionId}`);

        // Get contact first
        const contact = await this.getContact(sessionId, phoneNumber);
        if (!contact) {
          throw ErrorFactory.validation('Contact not found', 'phoneNumber', phoneNumber);
        }

        // Get session manager to access client
        const sessionManager = serviceLocator.get('sessionManager');
        const client = sessionManager?.getClient(sessionId);
        if (!client) {
          throw ErrorFactory.session(`No active client for session ${sessionId}`, sessionId);
        }

        // Block the contact
        const whatsAppContact = await client.getContactById(contact.id);
        if (whatsAppContact) {
          await whatsAppContact.block();
        }

        // Emit contact blocked event
        await eventBus.publish('whatsapp:contact-blocked', {
          sessionId,
          contactId: contact.id,
          phoneNumber,
          timestamp: new Date(),
        });

        logger.info(`✅ Contact blocked successfully: ${phoneNumber}`);
        return true;
      },
      {
        operationName: 'block-contact',
        context: { sessionId, phoneNumber },
        timeout: 15000,
      }
    ).then(result => {
      if (isFailure(result)) {
        logger.error(`❌ Failed to block contact:`, result.error);
        return false;
      }
      return result.data;
    });
  }

  /**
   * Unblock a contact
   */
  @LogExecutionTime({ operationId: 'unblock-contact' })
  public async unblockContact(sessionId: string, phoneNumber: string): Promise<boolean> {
    return SafeExecutor.execute(
      async () => {
        logger.info(`✅ Unblocking contact ${phoneNumber} in session ${sessionId}`);

        // Get contact first
        const contact = await this.getContact(sessionId, phoneNumber);
        if (!contact) {
          throw ErrorFactory.validation('Contact not found', 'phoneNumber', phoneNumber);
        }

        // Get session manager to access client
        const sessionManager = serviceLocator.get('sessionManager');
        const client = sessionManager?.getClient(sessionId);
        if (!client) {
          throw ErrorFactory.session(`No active client for session ${sessionId}`, sessionId);
        }

        // Unblock the contact
        const whatsAppContact = await client.getContactById(contact.id);
        if (whatsAppContact) {
          await whatsAppContact.unblock();
        }

        // Emit contact unblocked event
        await eventBus.publish('whatsapp:contact-unblocked', {
          sessionId,
          contactId: contact.id,
          phoneNumber,
          timestamp: new Date(),
        });

        logger.info(`✅ Contact unblocked successfully: ${phoneNumber}`);
        return true;
      },
      {
        operationName: 'unblock-contact',
        context: { sessionId, phoneNumber },
        timeout: 15000,
      }
    ).then(result => {
      if (isFailure(result)) {
        logger.error(`❌ Failed to unblock contact:`, result.error);
        return false;
      }
      return result.data;
    });
  }

  /**
   * Get contact statistics for a session
   */
  public getContactStats(sessionId: string): {
    totalContacts: number;
    cachedContacts: number;
    cachedChats: number;
    businessContacts: number;
    groupChats: number;
  } {
    const sessionContactCache = this.contactCache.get(sessionId);
    const sessionChatCache = this.chatCache.get(sessionId);

    let businessContacts = 0;
    let groupChats = 0;

    if (sessionContactCache) {
      for (const contact of sessionContactCache.values()) {
        if (contact.isBusiness) businessContacts++;
      }
    }

    if (sessionChatCache) {
      for (const chat of sessionChatCache.values()) {
        if (chat.isGroup) groupChats++;
      }
    }

    return {
      totalContacts: sessionContactCache?.size || 0,
      cachedContacts: sessionContactCache?.size || 0,
      cachedChats: sessionChatCache?.size || 0,
      businessContacts,
      groupChats,
    };
  }

  /**
   * Get detailed contact information (required by IContactManager interface)
   */
  @LogExecutionTime({ operationId: 'get-contact-info' })
  public async getContactInfo(sessionId: string, phoneNumber: string): Promise<ContactInfo | null> {
    const contact = await this.getContact(sessionId, phoneNumber);
    if (!contact) {
      return null;
    }

    return {
      id: contact.id,
      name: contact.name || undefined,
      phoneNumber: contact.phoneNumber,
      profilePicture: contact.profilePicUrl || undefined,
      isBlocked: false, // Would need to implement actual blocking check
      isBusiness: contact.isBusiness,
      verifiedName: contact.formattedName || undefined,
    };
  }

  /**
   * Get detailed chat information (required by IContactManager interface)
   */
  @LogExecutionTime({ operationId: 'get-chat-info-detailed' })
  public async getChatInfo(sessionId: string, chatId: string): Promise<ChatInfo | null> {
    return await this.getChat(sessionId, chatId);
  }

  /**
   * Synchronize contacts with WhatsApp Web (required by IContactManager interface)
   */
  @LogExecutionTime({ operationId: 'sync-contacts' })
  public async syncContacts(sessionId: string): Promise<void> {
    logger.info(`🔄 Syncing contacts for session ${sessionId}`);

    // Clear existing cache
    this.clearContactCache(sessionId);

    // Reload all contacts and chats to rebuild cache
    await Promise.all([this.getAllContacts(sessionId), this.getAllChats(sessionId)]);

    logger.info(`✅ Contacts synced for session ${sessionId}`);
  }

  /**
   * Cleanup cache for a session
   */
  public cleanup(sessionId: string): void {
    logger.info(`🧹 Cleaning up contact manager data for session ${sessionId}`);

    this.contactCache.delete(sessionId);
    this.chatCache.delete(sessionId);

    logger.info(`✅ Contact manager cleanup completed for session ${sessionId}`);
  }
}
