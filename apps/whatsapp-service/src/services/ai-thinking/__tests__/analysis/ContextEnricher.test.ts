import { ContextEnricher } from '../../analysis/ContextEnricher';
import { MessageContext } from '../../../AIService';
import { EnrichedContext, TimeContext } from '../../interfaces/types';
import { ContextEnrichmentError } from '../../errors/ThinkingServiceErrors';
import DatabaseService from '../../../DatabaseService';
import { logger } from '../../../../utils/logger';

// Mock dependencies
jest.mock('../../../DatabaseService');
jest.mock('../../../../utils/logger');

describe('ContextEnricher', () => {
  let contextEnricher: ContextEnricher;
  let mockDatabaseService: jest.Mocked<typeof DatabaseService>;

  const mockMessageContext: MessageContext = {
    from: '+1234567890',
    sessionId: 'test-session-123',
    phoneNumber: '+1234567890',
  };

  const mockConversationHistory = [
    {
      id: 'msg-1',
      messageText: 'Hello',
      responseText: 'Hi there!',
      intent: 'greeting',
      createdAt: new Date('2024-01-01T10:00:00Z'),
      isFromUser: true,
    },
    {
      id: 'msg-2',
      messageText: null,
      responseText: 'How can I help you?',
      intent: 'assistance_offer',
      createdAt: new Date('2024-01-01T10:01:00Z'),
      isFromUser: false,
    },
  ];

  const mockLeads = [
    {
      id: 'lead-1',
      name: 'John Doe',
      phone: '+1234567890',
      email: 'john@example.com',
      status: 'active',
    },
    {
      id: 'lead-2',
      name: 'Jane Smith',
      phone: '+0987654321',
      email: 'jane@example.com',
      status: 'pending',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset singleton instance
    (ContextEnricher as any).instance = null;
    contextEnricher = ContextEnricher.getInstance();

    // Setup DatabaseService mocks
    mockDatabaseService = DatabaseService as jest.Mocked<typeof DatabaseService>;
    mockDatabaseService.getConversationHistory = jest
      .fn()
      .mockResolvedValue(mockConversationHistory);
    mockDatabaseService.getAllLeads = jest.fn().mockResolvedValue(mockLeads);
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance when called multiple times', () => {
      const instance1 = ContextEnricher.getInstance();
      const instance2 = ContextEnricher.getInstance();

      expect(instance1).toBe(instance2);
      expect(instance1).toBeInstanceOf(ContextEnricher);
    });

    it('should not allow direct instantiation', () => {
      expect(() => new (ContextEnricher as any)()).toThrow();
    });
  });

  describe('enrich()', () => {
    it('should enrich context with all available data when phone number is provided', async () => {
      const currentMessage = 'I need help with pricing';

      // Mock current time to be predictable
      const mockDate = new Date('2024-01-15T14:30:00Z'); // Monday, 2:30 PM
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

      const result = await contextEnricher.enrich(mockMessageContext, currentMessage);

      expect(result).toEqual({
        ...mockMessageContext,
        messageText: currentMessage,
        previousIntents: [],
        messageHistory: [
          {
            message: 'Hello',
            intent: 'greeting',
            timestamp: new Date('2024-01-01T10:00:00Z'),
            isFromUser: true,
          },
          {
            message: 'How can I help you?',
            intent: 'assistance_offer',
            timestamp: new Date('2024-01-01T10:01:00Z'),
            isFromUser: false,
          },
        ],
        userEngagementLevel: 'medium',
        timeOfDay: 'afternoon',
        dayOfWeek: 'weekday',
        leadProfile: mockLeads[0],
      });

      expect(mockDatabaseService.getConversationHistory).toHaveBeenCalledWith(
        mockMessageContext.phoneNumber,
        10
      );
      expect(mockDatabaseService.getAllLeads).toHaveBeenCalled();

      (global.Date as any).mockRestore();
    });

    it('should handle missing phone number gracefully', async () => {
      const contextWithoutPhone: MessageContext = {
        from: 'test-user',
        sessionId: 'test-session',
      };
      const currentMessage = 'Test message';

      const result = await contextEnricher.enrich(contextWithoutPhone, currentMessage);

      expect(result.messageHistory).toEqual([]);
      expect(result.leadProfile).toBeUndefined();
      expect(result.userEngagementLevel).toBe('low'); // No message history = low engagement
      expect(mockDatabaseService.getConversationHistory).not.toHaveBeenCalled();
      expect(mockDatabaseService.getAllLeads).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully and continue enrichment', async () => {
      const currentMessage = 'Test message';

      // Mock database errors
      mockDatabaseService.getConversationHistory.mockRejectedValue(
        new Error('DB connection failed')
      );
      mockDatabaseService.getAllLeads.mockRejectedValue(new Error('DB query failed'));

      const result = await contextEnricher.enrich(mockMessageContext, currentMessage);

      expect(result.messageHistory).toEqual([]);
      expect(result.leadProfile).toBeUndefined();
      expect(result.userEngagementLevel).toBe('low');
      expect(logger.warn).toHaveBeenCalledTimes(2);
    });

    it('should throw ContextEnrichmentError on critical failures', async () => {
      const currentMessage = 'Test message';

      // Mock a critical error in time analysis
      jest.spyOn(contextEnricher, 'analyzeTimeContext').mockImplementation(() => {
        throw new Error('Critical system error');
      });

      await expect(contextEnricher.enrich(mockMessageContext, currentMessage)).rejects.toThrow(
        ContextEnrichmentError
      );

      expect(logger.error).toHaveBeenCalledWith('Error enriching context:', expect.any(Error));
    });
  });

  describe('calculateEngagementLevel()', () => {
    it('should return "low" for no message history', () => {
      const context: Partial<EnrichedContext> = {
        messageHistory: [],
      };

      const result = contextEnricher.calculateEngagementLevel(context as EnrichedContext);
      expect(result).toBe('low');
    });

    it('should return "low" for undefined message history', () => {
      const context: Partial<EnrichedContext> = {};

      const result = contextEnricher.calculateEngagementLevel(context as EnrichedContext);
      expect(result).toBe('low');
    });

    it('should return "medium" for 1-4 messages', () => {
      const context: Partial<EnrichedContext> = {
        messageHistory: [
          { message: 'msg1', intent: 'greeting', timestamp: new Date(), isFromUser: true },
          { message: 'msg2', intent: 'question', timestamp: new Date(), isFromUser: true },
          { message: 'msg3', intent: 'response', timestamp: new Date(), isFromUser: false },
        ],
      };

      const result = contextEnricher.calculateEngagementLevel(context as EnrichedContext);
      expect(result).toBe('medium');
    });

    it('should return "high" for 5 or more messages', () => {
      const context: Partial<EnrichedContext> = {
        messageHistory: Array(6)
          .fill(null)
          .map((_, i) => ({
            message: `msg${i}`,
            intent: 'conversation',
            timestamp: new Date(),
            isFromUser: i % 2 === 0,
          })),
      };

      const result = contextEnricher.calculateEngagementLevel(context as EnrichedContext);
      expect(result).toBe('high');
    });
  });

  describe('analyzeTimeContext()', () => {
    it('should correctly identify morning time (6-11)', () => {
      const mockDate = new Date('2024-01-15T09:30:00Z'); // Monday, 9:30 AM
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

      const result = contextEnricher.analyzeTimeContext();

      expect(result).toEqual({
        timeOfDay: 'morning',
        dayOfWeek: 'weekday',
      });

      (global.Date as any).mockRestore();
    });

    it('should correctly identify afternoon time (12-17)', () => {
      const mockDate = new Date('2024-01-15T15:45:00Z'); // Monday, 3:45 PM
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

      const result = contextEnricher.analyzeTimeContext();

      expect(result).toEqual({
        timeOfDay: 'afternoon',
        dayOfWeek: 'weekday',
      });

      (global.Date as any).mockRestore();
    });

    it('should correctly identify evening time (18-21)', () => {
      const mockDate = new Date('2024-01-15T20:00:00Z'); // Monday, 8:00 PM
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

      const result = contextEnricher.analyzeTimeContext();

      expect(result).toEqual({
        timeOfDay: 'evening',
        dayOfWeek: 'weekday',
      });

      (global.Date as any).mockRestore();
    });

    it('should correctly identify night time (22-5)', () => {
      const mockDate = new Date('2024-01-15T23:30:00Z'); // Monday, 11:30 PM
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

      const result = contextEnricher.analyzeTimeContext();

      expect(result).toEqual({
        timeOfDay: 'night',
        dayOfWeek: 'weekday',
      });

      (global.Date as any).mockRestore();
    });

    it('should correctly identify weekend days', () => {
      const mockSunday = new Date('2024-01-14T10:00:00Z'); // Sunday
      jest.spyOn(global, 'Date').mockImplementation(() => mockSunday as any);

      const result = contextEnricher.analyzeTimeContext();

      expect(result.dayOfWeek).toBe('weekend');

      (global.Date as any).mockRestore();
    });

    it('should correctly identify weekend days (Saturday)', () => {
      const mockSaturday = new Date('2024-01-13T10:00:00Z'); // Saturday
      jest.spyOn(global, 'Date').mockImplementation(() => mockSaturday as any);

      const result = contextEnricher.analyzeTimeContext();

      expect(result.dayOfWeek).toBe('weekend');

      (global.Date as any).mockRestore();
    });
  });

  describe('enrichWithConversationHistory()', () => {
    it('should correctly map conversation history', async () => {
      const enriched: Partial<EnrichedContext> = {};

      await (contextEnricher as any).enrichWithConversationHistory(enriched, '+1234567890');

      expect(enriched.messageHistory).toEqual([
        {
          message: 'Hello',
          intent: 'greeting',
          timestamp: new Date('2024-01-01T10:00:00Z'),
          isFromUser: true,
        },
        {
          message: 'How can I help you?',
          intent: 'assistance_offer',
          timestamp: new Date('2024-01-01T10:01:00Z'),
          isFromUser: false,
        },
      ]);

      expect(mockDatabaseService.getConversationHistory).toHaveBeenCalledWith('+1234567890', 10);
      expect(logger.debug).toHaveBeenCalledWith('Conversation history enriched:', {
        phoneNumber: '+1234567890',
        messageCount: 2,
      });
    });

    it('should handle empty conversation history', async () => {
      mockDatabaseService.getConversationHistory.mockResolvedValue([]);
      const enriched: Partial<EnrichedContext> = {};

      await (contextEnricher as any).enrichWithConversationHistory(enriched, '+1234567890');

      expect(enriched.messageHistory).toEqual([]);
    });

    it('should handle database errors gracefully', async () => {
      mockDatabaseService.getConversationHistory.mockRejectedValue(new Error('DB Error'));
      const enriched: Partial<EnrichedContext> = {};

      await (contextEnricher as any).enrichWithConversationHistory(enriched, '+1234567890');

      expect(enriched.messageHistory).toEqual([]);
      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to enrich with conversation history:',
        expect.any(Error)
      );
    });
  });

  describe('enrichWithLeadProfile()', () => {
    it('should find and attach matching lead profile', async () => {
      const enriched: Partial<EnrichedContext> = {};

      await (contextEnricher as any).enrichWithLeadProfile(enriched, '+1234567890');

      expect(enriched.leadProfile).toEqual(mockLeads[0]);
      expect(logger.debug).toHaveBeenCalledWith('Lead profile found and attached:', {
        phoneNumber: '+1234567890',
        leadId: 'lead-1',
        leadName: 'John Doe',
      });
    });

    it('should handle phone number normalization', async () => {
      const enriched: Partial<EnrichedContext> = {};

      await (contextEnricher as any).enrichWithLeadProfile(enriched, '1-234-567-890');

      expect(enriched.leadProfile).toEqual(mockLeads[0]);
    });

    it('should handle no matching lead profile', async () => {
      const enriched: Partial<EnrichedContext> = {};

      await (contextEnricher as any).enrichWithLeadProfile(enriched, '+9999999999');

      expect(enriched.leadProfile).toBeUndefined();
    });

    it('should handle database errors gracefully', async () => {
      mockDatabaseService.getAllLeads.mockRejectedValue(new Error('DB Error'));
      const enriched: Partial<EnrichedContext> = {};

      await (contextEnricher as any).enrichWithLeadProfile(enriched, '+1234567890');

      expect(enriched.leadProfile).toBeUndefined();
      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to enrich with lead profile:',
        expect.any(Error)
      );
    });
  });

  describe('createBasicContext()', () => {
    it('should create basic enriched context without database dependencies', () => {
      const currentMessage = 'Basic message';
      const mockDate = new Date('2024-01-15T16:00:00Z'); // Monday, 4:00 PM
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

      const result = contextEnricher.createBasicContext(mockMessageContext, currentMessage);

      expect(result).toEqual({
        ...mockMessageContext,
        messageText: currentMessage,
        previousIntents: [],
        messageHistory: [],
        userEngagementLevel: 'medium',
        timeOfDay: 'afternoon',
        dayOfWeek: 'weekday',
      });

      expect(mockDatabaseService.getConversationHistory).not.toHaveBeenCalled();
      expect(mockDatabaseService.getAllLeads).not.toHaveBeenCalled();

      (global.Date as any).mockRestore();
    });
  });

  describe('getContextSummary()', () => {
    it('should provide comprehensive context summary', () => {
      const mockContext: EnrichedContext = {
        ...mockMessageContext,
        messageText: 'Test message',
        previousIntents: ['greeting', 'question'],
        messageHistory: Array(3)
          .fill(null)
          .map(() => ({
            message: 'test',
            intent: 'test',
            timestamp: new Date(),
            isFromUser: true,
          })),
        userEngagementLevel: 'high',
        timeOfDay: 'afternoon',
        dayOfWeek: 'weekday',
        leadProfile: mockLeads[0],
      };

      const summary = contextEnricher.getContextSummary(mockContext);

      expect(summary).toEqual({
        hasPhone: true,
        messageHistoryCount: 3,
        hasLeadProfile: true,
        engagementLevel: 'high',
        timeOfDay: 'afternoon',
        dayOfWeek: 'weekday',
        previousIntentsCount: 2,
      });
    });

    it('should handle minimal context data', () => {
      const mockContext: EnrichedContext = {
        sessionId: 'test',
        messageText: 'Test',
        previousIntents: [],
        messageHistory: [],
        userEngagementLevel: 'low',
        timeOfDay: 'morning',
        dayOfWeek: 'weekend',
      };

      const summary = contextEnricher.getContextSummary(mockContext);

      expect(summary).toEqual({
        hasPhone: false,
        messageHistoryCount: 0,
        hasLeadProfile: false,
        engagementLevel: 'low',
        timeOfDay: 'morning',
        dayOfWeek: 'weekend',
        previousIntentsCount: 0,
      });
    });
  });

  describe('Performance and Edge Cases', () => {
    it('should handle large conversation histories efficiently', async () => {
      const largeHistory = Array(100)
        .fill(null)
        .map((_, i) => ({
          id: `msg-${i}`,
          messageText: `Message ${i}`,
          responseText: `Response ${i}`,
          intent: 'conversation',
          createdAt: new Date(),
          isFromUser: i % 2 === 0,
        }));

      mockDatabaseService.getConversationHistory.mockResolvedValue(largeHistory);

      const start = Date.now();
      const result = await contextEnricher.enrich(mockMessageContext, 'Test message');
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(1000); // Should complete within 1 second
      expect(result.messageHistory).toHaveLength(100);
      expect(result.userEngagementLevel).toBe('high');
    });

    it('should handle special characters in phone numbers', async () => {
      const contextWithSpecialPhone: MessageContext = {
        ...mockMessageContext,
        phoneNumber: '+1 (234) 567-890 ext.123',
      };

      await expect(
        contextEnricher.enrich(contextWithSpecialPhone, 'Test message')
      ).resolves.toBeDefined();
    });

    it('should handle concurrent enrichment requests', async () => {
      const promises = Array(5)
        .fill(null)
        .map((_, i) =>
          contextEnricher.enrich(
            { ...mockMessageContext, sessionId: `session-${i}` },
            `Message ${i}`
          )
        );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      results.forEach((result, i) => {
        expect(result.sessionId).toBe(`session-${i}`);
        expect(result.messageText).toBe(`Message ${i}`);
      });
    });
  });

  describe('Error Handling', () => {
    it('should provide detailed error information in ContextEnrichmentError', async () => {
      jest.spyOn(contextEnricher, 'analyzeTimeContext').mockImplementation(() => {
        throw new Error('Time analysis failed');
      });

      try {
        await contextEnricher.enrich(mockMessageContext, 'Test message');
        fail('Expected ContextEnrichmentError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ContextEnrichmentError);
        expect(error.message).toBe('Failed to enrich context');
        expect((error as any).details).toEqual({
          phoneNumber: mockMessageContext.phoneNumber,
          sessionId: mockMessageContext.sessionId,
          error: 'Time analysis failed',
        });
      }
    });

    it('should handle unknown error types', async () => {
      jest.spyOn(contextEnricher, 'analyzeTimeContext').mockImplementation(() => {
        throw 'String error';
      });

      try {
        await contextEnricher.enrich(mockMessageContext, 'Test message');
        fail('Expected ContextEnrichmentError to be thrown');
      } catch (error) {
        expect((error as any).details.error).toBe('Unknown error');
      }
    });
  });
});
