const mockGetAiAgentWithProducts = jest.fn();
const mockGetKnowledgeItemsByAgent = jest.fn();

jest.mock('../DatabaseService', () => ({
  __esModule: true,
  default: {
    getAiAgentWithProducts: (...args: any[]) => mockGetAiAgentWithProducts(...args),
    getKnowledgeItemsByAgent: (...args: any[]) => mockGetKnowledgeItemsByAgent(...args),
    getAIConfiguration: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock('../../config/enhanced-ai.config', () => ({
  aiConfig: {
    getPromptConfig: () => ({
      platform: 'TestPlatform',
      maxPromptLength: 8000,
      includeContext: false,
      includeProductInfo: false,
      language: 'es',
    }),
  },
}));

import { SystemPromptService } from './SystemPromptService';
import type { AiAgentData, AiProductData } from '../DatabaseService';

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const AGENT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function makeAgent(overrides?: Partial<AiAgentData>): AiAgentData {
  return {
    id: AGENT_ID,
    businessName: 'TestBusiness',
    industry: 'Technology',
    websiteUrl: 'https://test.com',
    businessHours: null,
    personaName: 'Ana',
    tone: 'FRIENDLY',
    language: 'es',
    customInstructions: null,
    responseMaxWords: 80,
    allowEmojis: true,
    primaryGoal: 'CONTACT',
    goalCtaUrl: null,
    goalDescription: null,
    enableStructuredExtraction: false,
    ...overrides,
  };
}

function makeProducts(): AiProductData[] {
  return [
    { id: 'p1', name: 'Plan Basic', description: 'Entry plan', priceMin: 10, priceMax: 10, url: null, tags: [] },
    { id: 'p2', name: 'Plan Pro', description: 'Advanced', priceMin: 50, priceMax: 100, url: 'https://test.com/pro', tags: ['popular'] },
  ];
}

describe('SystemPromptService.buildAgentSystemPrompt', () => {
  let service: SystemPromptService;

  beforeEach(() => {
    mockGetAiAgentWithProducts.mockReset();
    mockGetKnowledgeItemsByAgent.mockReset();
    service = new SystemPromptService();
  });

  it('returns neutral prompt when aiAgentId is null', async () => {
    const result = await service.buildAgentSystemPrompt(null, { from: 'test', sessionId: 's1' });
    expect(result).toContain('asistente virtual profesional');
    expect(result).not.toContain('EscortsHub');
  });

  it('returns neutral prompt when tenantId is missing', async () => {
    const result = await service.buildAgentSystemPrompt(AGENT_ID, { from: 'test', sessionId: 's1' });
    expect(result).toContain('asistente virtual profesional');
    expect(result).not.toContain('EscortsHub');
    expect(mockGetAiAgentWithProducts).not.toHaveBeenCalled();
  });

  it('composes dynamic prompt from agent config', async () => {
    const agent = makeAgent();
    const products = makeProducts();
    mockGetAiAgentWithProducts.mockResolvedValue({ agent, products });
    mockGetKnowledgeItemsByAgent.mockResolvedValue([]);

    const result = await service.buildAgentSystemPrompt(AGENT_ID, {
      from: 'test', sessionId: 's1', tenantId: TENANT_ID,
    });

    expect(result).toContain('TestBusiness');
    expect(result).toContain('Ana');
    expect(result).toContain('Plan Basic');
    expect(result).toContain('Plan Pro');
    expect(result).not.toContain('EscortsHub');
    expect(mockGetAiAgentWithProducts).toHaveBeenCalledWith(TENANT_ID, AGENT_ID);
  });

  it('includes knowledge items in prompt', async () => {
    mockGetAiAgentWithProducts.mockResolvedValue({ agent: makeAgent(), products: [] });
    mockGetKnowledgeItemsByAgent.mockResolvedValue([
      { id: 'k1', category: 'faq', title: 'Horarios', content: 'Lunes a viernes 9-18', keywords: [], priority: 1 },
    ]);

    const result = await service.buildAgentSystemPrompt(AGENT_ID, {
      from: 'test', sessionId: 's1', tenantId: TENANT_ID,
    });

    expect(result).toContain('Horarios');
    expect(result).toContain('Lunes a viernes');
  });

  it('uses FORMAL tone instructions', async () => {
    mockGetAiAgentWithProducts.mockResolvedValue({ agent: makeAgent({ tone: 'FORMAL' }), products: [] });
    mockGetKnowledgeItemsByAgent.mockResolvedValue([]);

    const result = await service.buildAgentSystemPrompt(AGENT_ID, {
      from: 'test', sessionId: 's1', tenantId: TENANT_ID,
    });

    expect(result).toContain('usted');
    expect(result).toContain('Sin emojis');
  });

  it('uses REGISTER goal with CTA URL', async () => {
    mockGetAiAgentWithProducts.mockResolvedValue({
      agent: makeAgent({ primaryGoal: 'REGISTER', goalCtaUrl: 'https://test.com/signup' }),
      products: [],
    });
    mockGetKnowledgeItemsByAgent.mockResolvedValue([]);

    const result = await service.buildAgentSystemPrompt(AGENT_ID, {
      from: 'test', sessionId: 's1', tenantId: TENANT_ID,
    });

    expect(result).toContain('registro');
    expect(result).toContain('https://test.com/signup');
  });

  it('truncates custom instructions to 2000 chars', async () => {
    const longInstructions = 'A'.repeat(3000);
    mockGetAiAgentWithProducts.mockResolvedValue({
      agent: makeAgent({ customInstructions: longInstructions }),
      products: [],
    });
    mockGetKnowledgeItemsByAgent.mockResolvedValue([]);

    const result = await service.buildAgentSystemPrompt(AGENT_ID, {
      from: 'test', sessionId: 's1', tenantId: TENANT_ID,
    });

    const match = result.match(/INSTRUCCIONES DEL NEGOCIO[^\n]*\n([\s\S]*?)(?:\n\n|$)/);
    const instructionsBody = match ? match[1] : '';
    expect(instructionsBody.length).toBeLessThanOrEqual(2000);
    expect(result).not.toContain('A'.repeat(2001));
  });

  it('falls back to neutral prompt when agent not found', async () => {
    mockGetAiAgentWithProducts.mockResolvedValue(null);

    const result = await service.buildAgentSystemPrompt(AGENT_ID, {
      from: 'test', sessionId: 's1', tenantId: TENANT_ID,
    });

    expect(result).toContain('asistente virtual profesional');
    expect(result).not.toContain('EscortsHub');
  });

  it('hides emojis when allowEmojis is false', async () => {
    mockGetAiAgentWithProducts.mockResolvedValue({
      agent: makeAgent({ allowEmojis: false }),
      products: [],
    });
    mockGetKnowledgeItemsByAgent.mockResolvedValue([]);

    const result = await service.buildAgentSystemPrompt(AGENT_ID, {
      from: 'test', sessionId: 's1', tenantId: TENANT_ID,
    });

    expect(result).toContain('NO usar emojis');
  });
});
