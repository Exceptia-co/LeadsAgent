import { KnowledgeRetriever } from '../../analysis/KnowledgeRetriever';
import { IntentAnalysis } from '../../interfaces/types';
import { KnowledgeRetrievalError } from '../../errors/ThinkingServiceErrors';
import DatabaseService from '../../../DatabaseService';
import { logger } from '../../../../utils/logger';

// Mock dependencies
jest.mock('../../../DatabaseService');
jest.mock('../../../../utils/logger');

describe('KnowledgeRetriever', () => {
  let knowledgeRetriever: KnowledgeRetriever;
  let mockDatabaseService: jest.Mocked<typeof DatabaseService>;

  const mockIntentAnalysis: IntentAnalysis = {
    intent: 'pricing_inquiry',
    confidence: 0.8,
    entities: { product: 'premium' },
    sentiment: 'neutral',
    urgency: 'medium',
    category: 'commercial',
    subcategory: 'pricing',
  };

  const mockKnowledgeItems = [
    {
      id: 'kb-1',
      title: 'Precios del servicio premium',
      content: 'El servicio premium cuesta $99 al mes',
      category: 'commercial',
      subcategory: 'pricing',
      match_quality: 0.9,
    },
    {
      id: 'kb-2',
      title: 'Características del servicio',
      content: 'El servicio incluye soporte 24/7',
      category: 'product',
      subcategory: 'features',
      match_quality: 0.7,
    },
    {
      id: 'kb-3',
      title: 'Proceso de registro',
      content: 'Para registrarse, visite nuestro sitio web',
      category: 'support',
      subcategory: 'registration',
      match_quality: 0.6,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset singleton instance
    (KnowledgeRetriever as any).instance = null;
    knowledgeRetriever = KnowledgeRetriever.getInstance();

    // Setup DatabaseService mocks
    mockDatabaseService = DatabaseService as jest.Mocked<typeof DatabaseService>;
    mockDatabaseService.searchKnowledgeBase = jest
      .fn()
      .mockResolvedValue(mockKnowledgeItems.slice(0, 2));
    mockDatabaseService.getKnowledgeBase = jest.fn().mockResolvedValue([mockKnowledgeItems[0]]);
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance when called multiple times', () => {
      const instance1 = KnowledgeRetriever.getInstance();
      const instance2 = KnowledgeRetriever.getInstance();

      expect(instance1).toBe(instance2);
      expect(instance1).toBeInstanceOf(KnowledgeRetriever);
    });

    it('should not allow direct instantiation', () => {
      expect(() => new (KnowledgeRetriever as any)()).toThrow();
    });
  });

  describe('retrieve()', () => {
    it('should retrieve and combine knowledge from multiple sources', async () => {
      const message = 'cuánto cuesta el servicio premium';

      const result = await knowledgeRetriever.retrieve(message, mockIntentAnalysis);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeLessThanOrEqual(5);

      expect(mockDatabaseService.searchKnowledgeBase).toHaveBeenCalledWith(message);
      expect(mockDatabaseService.getKnowledgeBase).toHaveBeenCalledWith('commercial');

      expect(logger.debug).toHaveBeenCalledWith(
        'Knowledge retrieval completed:',
        expect.objectContaining({
          message: expect.any(String),
          intent: 'pricing_inquiry',
          category: 'commercial',
          foundItems: expect.any(Number),
        })
      );
    });

    it('should remove duplicate knowledge items', async () => {
      const duplicateItem = { ...mockKnowledgeItems[0] };
      mockDatabaseService.searchKnowledgeBase.mockResolvedValue([
        mockKnowledgeItems[0],
        duplicateItem,
      ]);
      mockDatabaseService.getKnowledgeBase.mockResolvedValue([mockKnowledgeItems[0]]);

      const result = await knowledgeRetriever.retrieve('test message', mockIntentAnalysis);

      // Should only have one instance of the item with id 'kb-1'
      const duplicateItems = result.filter(item => item.id === 'kb-1');
      expect(duplicateItems.length).toBe(1);
    });

    it('should limit results to 5 items', async () => {
      const manyItems = Array(10)
        .fill(null)
        .map((_, i) => ({
          ...mockKnowledgeItems[0],
          id: `kb-${i}`,
          title: `Item ${i}`,
        }));

      mockDatabaseService.searchKnowledgeBase.mockResolvedValue(manyItems.slice(0, 7));
      mockDatabaseService.getKnowledgeBase.mockResolvedValue(manyItems.slice(7, 10));

      const result = await knowledgeRetriever.retrieve('test message', mockIntentAnalysis);

      expect(result.length).toBeLessThanOrEqual(5);
    });

    it('should sort results by relevance', async () => {
      const message = 'precio servicio premium';

      const result = await knowledgeRetriever.retrieve(message, mockIntentAnalysis);

      expect(result).toBeDefined();
      // Items should be sorted, with most relevant first
      if (result.length > 1) {
        // The first item should have good relevance to pricing
        expect(result[0].title || result[0].content).toMatch(/precio|servicio|premium/i);
      }
    });

    it('should handle database errors gracefully and throw KnowledgeRetrievalError', async () => {
      mockDatabaseService.searchKnowledgeBase.mockRejectedValue(
        new Error('Database connection failed')
      );

      await expect(knowledgeRetriever.retrieve('test message', mockIntentAnalysis)).rejects.toThrow(
        KnowledgeRetrievalError
      );

      expect(logger.error).toHaveBeenCalledWith('Error in knowledge retrieval:', expect.any(Error));
    });

    it('should provide detailed error information in KnowledgeRetrievalError', async () => {
      mockDatabaseService.searchKnowledgeBase.mockRejectedValue(new Error('Test error'));

      try {
        await knowledgeRetriever.retrieve('test message', mockIntentAnalysis);
        fail('Expected KnowledgeRetrievalError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(KnowledgeRetrievalError);
        expect(error.message).toBe('Failed to retrieve knowledge');
        expect((error as any).details).toEqual({
          message: 'test message',
          intent: 'pricing_inquiry',
          category: 'commercial',
          error: 'Test error',
        });
      }
    });
  });

  describe('searchKnowledgeBase()', () => {
    it('should search knowledge base successfully', async () => {
      const query = 'precio servicio';

      const result = await knowledgeRetriever.searchKnowledgeBase(query);

      expect(result).toEqual(mockKnowledgeItems.slice(0, 2));
      expect(mockDatabaseService.searchKnowledgeBase).toHaveBeenCalledWith(query);
    });

    it('should handle search errors gracefully', async () => {
      mockDatabaseService.searchKnowledgeBase.mockRejectedValue(new Error('Search failed'));

      const result = await knowledgeRetriever.searchKnowledgeBase('test query');

      expect(result).toEqual([]);
      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to search knowledge base:',
        expect.any(Error)
      );
    });
  });

  describe('getKnowledgeByCategory()', () => {
    it('should get knowledge by category successfully', async () => {
      const category = 'commercial';

      const result = await knowledgeRetriever.getKnowledgeByCategory(category);

      expect(result).toEqual([mockKnowledgeItems[0]]);
      expect(mockDatabaseService.getKnowledgeBase).toHaveBeenCalledWith(category);
    });

    it('should handle category search errors gracefully', async () => {
      mockDatabaseService.getKnowledgeBase.mockRejectedValue(new Error('Category search failed'));

      const result = await knowledgeRetriever.getKnowledgeByCategory('test-category');

      expect(result).toEqual([]);
      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to get knowledge by category:',
        expect.any(Error)
      );
    });
  });

  describe('advancedSearch()', () => {
    it('should perform advanced search with message criteria', async () => {
      const criteria = {
        message: 'precio servicio',
        limit: 3,
      };

      const result = await knowledgeRetriever.advancedSearch(criteria);

      expect(result).toBeDefined();
      expect(result.length).toBeLessThanOrEqual(3);
      expect(mockDatabaseService.searchKnowledgeBase).toHaveBeenCalledWith('precio servicio');
    });

    it('should perform advanced search with category criteria', async () => {
      const criteria = {
        category: 'commercial',
        limit: 5,
      };

      const result = await knowledgeRetriever.advancedSearch(criteria);

      expect(result).toBeDefined();
      expect(mockDatabaseService.getKnowledgeBase).toHaveBeenCalledWith('commercial');
    });

    it('should combine message and category search results', async () => {
      const criteria = {
        message: 'precio',
        category: 'commercial',
        limit: 10,
      };

      mockDatabaseService.searchKnowledgeBase.mockResolvedValue([mockKnowledgeItems[1]]);
      mockDatabaseService.getKnowledgeBase.mockResolvedValue([mockKnowledgeItems[0]]);

      const result = await knowledgeRetriever.advancedSearch(criteria);

      expect(result.length).toBe(2);
      expect(mockDatabaseService.searchKnowledgeBase).toHaveBeenCalledWith('precio');
      expect(mockDatabaseService.getKnowledgeBase).toHaveBeenCalledWith('commercial');
    });

    it('should filter by additional criteria', async () => {
      const criteria = {
        category: 'commercial',
        subcategory: 'pricing',
        urgency: 'high',
        sentiment: 'positive',
      };

      const itemsWithCriteria = [
        {
          ...mockKnowledgeItems[0],
          subcategory: 'pricing',
          urgency: 'high',
          sentiment: 'positive',
        },
        { ...mockKnowledgeItems[1], subcategory: 'features', urgency: 'low', sentiment: 'neutral' },
      ];

      mockDatabaseService.getKnowledgeBase.mockResolvedValue(itemsWithCriteria);

      const result = await knowledgeRetriever.advancedSearch(criteria);

      expect(result.length).toBe(1);
      expect(result[0].subcategory).toBe('pricing');
      expect(result[0].urgency).toBe('high');
      expect(result[0].sentiment).toBe('positive');
    });

    it('should handle advanced search errors gracefully', async () => {
      mockDatabaseService.searchKnowledgeBase.mockRejectedValue(
        new Error('Advanced search failed')
      );

      const criteria = { message: 'test' };
      const result = await knowledgeRetriever.advancedSearch(criteria);

      expect(result).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith(
        'Error in advanced knowledge search:',
        expect.any(Error)
      );
    });

    it('should use default limit of 10 when not specified', async () => {
      const manyItems = Array(15)
        .fill(null)
        .map((_, i) => ({
          ...mockKnowledgeItems[0],
          id: `kb-${i}`,
        }));

      mockDatabaseService.searchKnowledgeBase.mockResolvedValue(manyItems);

      const criteria = { message: 'test' };
      const result = await knowledgeRetriever.advancedSearch(criteria);

      expect(result.length).toBe(10);
    });
  });

  describe('sortByRelevance()', () => {
    it('should sort knowledge items by relevance score', () => {
      const knowledge = [
        { id: '1', title: 'General info', content: 'Basic information', category: 'general' },
        {
          id: '2',
          title: 'Precio servicio premium',
          content: 'Pricing details',
          category: 'commercial',
        },
        { id: '3', title: 'Features', content: 'Product features', category: 'product' },
      ];

      const message = 'precio servicio premium';
      const sorted = (knowledgeRetriever as any).sortByRelevance(
        knowledge,
        message,
        mockIntentAnalysis
      );

      expect(sorted[0].title).toContain('Precio servicio premium');
    });

    it('should handle sorting errors gracefully', () => {
      const knowledge = [
        { id: '1', title: null, content: null }, // Invalid data
        { id: '2', title: 'Valid item', content: 'Valid content' },
      ];

      const message = 'test';
      const sorted = (knowledgeRetriever as any).sortByRelevance(
        knowledge,
        message,
        mockIntentAnalysis
      );

      expect(sorted).toEqual(knowledge); // Should return original order on error
      expect(logger.warn).toHaveBeenCalledWith(
        'Error sorting by relevance, returning original order:',
        expect.any(Error)
      );
    });
  });

  describe('calculateRelevanceScore()', () => {
    it('should calculate higher scores for relevant items', () => {
      const item = {
        title: 'Precio servicio premium',
        content: 'Información sobre precios del servicio premium',
        category: 'commercial',
      };

      const messageWords = ['precio', 'servicio', 'premium'];
      const intentKeywords = ['pricing_inquiry', 'commercial'];

      const score = (knowledgeRetriever as any).calculateRelevanceScore(
        item,
        messageWords,
        intentKeywords
      );

      expect(score).toBeGreaterThan(0);
    });

    it('should give extra points for exact category matches', () => {
      const item = {
        title: 'Test item',
        content: 'Test content',
        category: 'commercial',
      };

      const messageWords = ['test'];
      const intentKeywords = ['commercial'];

      const score = (knowledgeRetriever as any).calculateRelevanceScore(
        item,
        messageWords,
        intentKeywords
      );

      expect(score).toBeGreaterThanOrEqual(5); // Should get category match bonus
    });

    it('should consider match_quality in scoring', () => {
      const highQualityItem = {
        title: 'Test',
        content: 'Test',
        category: 'test',
        match_quality: 0.9,
      };

      const lowQualityItem = {
        title: 'Test',
        content: 'Test',
        category: 'test',
        match_quality: 0.1,
      };

      const messageWords = ['test'];
      const intentKeywords = ['test'];

      const highScore = (knowledgeRetriever as any).calculateRelevanceScore(
        highQualityItem,
        messageWords,
        intentKeywords
      );
      const lowScore = (knowledgeRetriever as any).calculateRelevanceScore(
        lowQualityItem,
        messageWords,
        intentKeywords
      );

      expect(highScore).toBeGreaterThan(lowScore);
    });

    it('should handle string match_quality values', () => {
      const item = {
        title: 'Test',
        content: 'Test',
        category: 'test',
        match_quality: '0.8',
      };

      const messageWords = ['test'];
      const intentKeywords = ['test'];

      const score = (knowledgeRetriever as any).calculateRelevanceScore(
        item,
        messageWords,
        intentKeywords
      );

      expect(score).toBeGreaterThan(0);
    });

    it('should handle calculation errors gracefully', () => {
      const invalidItem = null;
      const messageWords = ['test'];
      const intentKeywords = ['test'];

      const score = (knowledgeRetriever as any).calculateRelevanceScore(
        invalidItem,
        messageWords,
        intentKeywords
      );

      expect(score).toBe(0);
      expect(logger.debug).toHaveBeenCalledWith(
        'Error calculating relevance score for item:',
        expect.any(Error)
      );
    });
  });

  describe('getKnowledgeStats()', () => {
    it('should return knowledge statistics', async () => {
      const stats = await knowledgeRetriever.getKnowledgeStats();

      expect(stats).toMatchObject({
        available: true,
        lastUpdated: expect.any(String),
        note: expect.any(String),
      });
    });

    it('should handle stats retrieval errors', async () => {
      // Mock an error in the stats method
      jest.spyOn(Date.prototype, 'toISOString').mockImplementation(() => {
        throw new Error('Date error');
      });

      const stats = await knowledgeRetriever.getKnowledgeStats();

      expect(stats).toEqual({
        available: false,
        error: 'Failed to retrieve stats',
      });
      expect(logger.error).toHaveBeenCalledWith(
        'Error getting knowledge stats:',
        expect.any(Error)
      );

      // Restore the mock
      jest.restoreAllMocks();
    });
  });

  describe('validateKnowledgeQuality()', () => {
    it('should filter out items without title or content', () => {
      const knowledge = [
        { id: '1', title: 'Valid title', content: 'Valid content' },
        { id: '2' }, // No title or content
        { id: '3', title: 'Another valid title' },
        { id: '4', content: 'Valid content only' },
      ];

      const filtered = knowledgeRetriever.validateKnowledgeQuality(knowledge);

      expect(filtered).toHaveLength(3);
      expect(filtered.map(item => item.id)).toEqual(['1', '3', '4']);
    });

    it('should filter by match_quality when available', () => {
      const knowledge = [
        { id: '1', title: 'High quality', content: 'Content', match_quality: 0.8 },
        { id: '2', title: 'Low quality', content: 'Content', match_quality: 0.3 },
        { id: '3', title: 'No quality info', content: 'Content' },
      ];

      const filtered = knowledgeRetriever.validateKnowledgeQuality(knowledge, 0.5);

      expect(filtered).toHaveLength(2);
      expect(filtered.map(item => item.id)).toEqual(['1', '3']);
    });

    it('should handle string match_quality values', () => {
      const knowledge = [
        { id: '1', title: 'Valid', content: 'Content', match_quality: '0.8' },
        { id: '2', title: 'Invalid', content: 'Content', match_quality: '0.2' },
      ];

      const filtered = knowledgeRetriever.validateKnowledgeQuality(knowledge, 0.5);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('1');
    });

    it('should handle invalid match_quality values', () => {
      const knowledge = [
        { id: '1', title: 'Valid', content: 'Content', match_quality: 'invalid' },
        { id: '2', title: 'Valid', content: 'Content', match_quality: NaN },
      ];

      const filtered = knowledgeRetriever.validateKnowledgeQuality(knowledge, 0.5);

      expect(filtered).toHaveLength(2); // Should accept items with invalid quality
    });

    it('should use default minQuality of 0.5', () => {
      const knowledge = [
        { id: '1', title: 'High', content: 'Content', match_quality: 0.8 },
        { id: '2', title: 'Low', content: 'Content', match_quality: 0.3 },
      ];

      const filtered = knowledgeRetriever.validateKnowledgeQuality(knowledge);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('1');
    });

    it('should handle validation errors gracefully', () => {
      const invalidKnowledge = [
        { id: '1', title: 'Valid', content: 'Content' },
        null, // Invalid item
        { id: '3', title: 'Another valid', content: 'Content' },
      ];

      const filtered = knowledgeRetriever.validateKnowledgeQuality(invalidKnowledge as any);

      expect(filtered).toHaveLength(2);
      expect(logger.debug).toHaveBeenCalledWith(
        'Error validating knowledge quality:',
        expect.any(Error)
      );
    });
  });

  describe('Integration and Performance Tests', () => {
    it('should handle large knowledge sets efficiently', async () => {
      const largeKnowledgeSet = Array(1000)
        .fill(null)
        .map((_, i) => ({
          id: `kb-${i}`,
          title: `Knowledge item ${i}`,
          content: `Content for item ${i}`,
          category: `category-${i % 10}`,
          match_quality: Math.random(),
        }));

      mockDatabaseService.searchKnowledgeBase.mockResolvedValue(largeKnowledgeSet);

      const start = Date.now();
      const result = await knowledgeRetriever.retrieve('test message', mockIntentAnalysis);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(1000); // Should complete within 1 second
      expect(result.length).toBeLessThanOrEqual(5);
    });

    it('should handle concurrent retrieval requests', async () => {
      const promises = Array(5)
        .fill(null)
        .map((_, i) =>
          knowledgeRetriever.retrieve(`message ${i}`, {
            ...mockIntentAnalysis,
            intent: `intent-${i}`,
          })
        );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(Array.isArray(result)).toBe(true);
      });
    });

    it('should handle empty knowledge base gracefully', async () => {
      mockDatabaseService.searchKnowledgeBase.mockResolvedValue([]);
      mockDatabaseService.getKnowledgeBase.mockResolvedValue([]);

      const result = await knowledgeRetriever.retrieve('test message', mockIntentAnalysis);

      expect(result).toEqual([]);
    });

    it('should handle complex search criteria combinations', async () => {
      const complexCriteria = {
        message: 'precio servicio premium',
        category: 'commercial',
        subcategory: 'pricing',
        urgency: 'high',
        sentiment: 'positive',
        limit: 3,
      };

      const result = await knowledgeRetriever.advancedSearch(complexCriteria);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
