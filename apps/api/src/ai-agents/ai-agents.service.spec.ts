import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AiAgentsService } from './ai-agents.service';
import { PrismaService } from '../prisma/prisma.service';

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const AGENT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OTHER_TENANT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('AiAgentsService', () => {
  let service: AiAgentsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      aiAgent: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        updateMany: jest.fn(),
      },
      ai_knowledge_base: {
        findMany: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
        findFirst: jest.fn(),
      },
      aiProduct: {
        findMany: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
        findFirst: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiAgentsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<AiAgentsService>(AiAgentsService);
  });

  describe('findOne — tenant scoping', () => {
    it('returns agent when tenant matches', async () => {
      const agent = { id: AGENT_ID, tenantId: TENANT_ID, name: 'Test', products: [], _count: {} };
      prisma.aiAgent.findFirst.mockResolvedValue(agent);

      const result = await service.findOne(TENANT_ID, AGENT_ID);
      expect(result).toEqual(agent);
      expect(prisma.aiAgent.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: AGENT_ID, tenantId: TENANT_ID },
        }),
      );
    });

    it('throws 404 when agent belongs to different tenant', async () => {
      prisma.aiAgent.findFirst.mockResolvedValue(null);

      await expect(service.findOne(OTHER_TENANT, AGENT_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update — tenant scoping', () => {
    it('uses updateMany with tenantId in WHERE', async () => {
      prisma.aiAgent.updateMany.mockResolvedValue({ count: 1 });
      prisma.aiAgent.findFirst.mockResolvedValue({ id: AGENT_ID, tenantId: TENANT_ID });

      await service.update(TENANT_ID, AGENT_ID, { businessName: 'New Name' });

      expect(prisma.aiAgent.updateMany).toHaveBeenCalledWith({
        where: { id: AGENT_ID, tenantId: TENANT_ID },
        data: { businessName: 'New Name' },
      });
    });

    it('throws 404 for cross-tenant update', async () => {
      prisma.aiAgent.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.update(OTHER_TENANT, AGENT_ID, { businessName: 'Hack' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createKnowledgeItem — ownership check', () => {
    it('verifies agent belongs to tenant before creating', async () => {
      prisma.aiAgent.findFirst.mockResolvedValue({ id: AGENT_ID });
      prisma.ai_knowledge_base.create.mockResolvedValue({ id: 'new-item' });

      await service.createKnowledgeItem(TENANT_ID, AGENT_ID, {
        category: 'faq',
        title: 'Test',
        content: 'Test content',
      });

      expect(prisma.aiAgent.findFirst).toHaveBeenCalledWith({
        where: { id: AGENT_ID, tenantId: TENANT_ID },
        select: { id: true },
      });
    });

    it('throws 404 if agent not found for tenant', async () => {
      prisma.aiAgent.findFirst.mockResolvedValue(null);

      await expect(
        service.createKnowledgeItem(OTHER_TENANT, AGENT_ID, {
          category: 'faq',
          title: 'Test',
          content: 'Test content',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteProduct — tenant scoping', () => {
    it('uses deleteMany with tenantId + agentId', async () => {
      prisma.aiAgent.findFirst.mockResolvedValue({ id: AGENT_ID });
      prisma.aiProduct.deleteMany.mockResolvedValue({ count: 1 });

      await service.deleteProduct(TENANT_ID, AGENT_ID, 'prod-1');

      expect(prisma.aiProduct.deleteMany).toHaveBeenCalledWith({
        where: { id: 'prod-1', tenantId: TENANT_ID, agentId: AGENT_ID },
      });
    });

    it('throws 404 for non-existent product', async () => {
      prisma.aiAgent.findFirst.mockResolvedValue({ id: AGENT_ID });
      prisma.aiProduct.deleteMany.mockResolvedValue({ count: 0 });

      await expect(
        service.deleteProduct(TENANT_ID, AGENT_ID, 'fake-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
