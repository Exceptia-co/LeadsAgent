import { Test, TestingModule } from '@nestjs/testing';
import { LeadsService } from './leads.service';
import { PrismaService } from '../prisma/prisma.service';
import { LeadStatus } from '@prisma/client';

// T5.1 — unit tests for LeadsService. Mocks PrismaService so the tests run
// without a database connection. Covers the 7 controller endpoints plus
// the soft-delete semantics introduced in T4.1.

type PrismaMock = {
  lead: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    aggregate: jest.Mock;
  };
};

function buildPrismaMock(): PrismaMock {
  return {
    lead: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn(),
    },
  };
}

describe('LeadsService', () => {
  let service: LeadsService;
  let prisma: PrismaMock;

  beforeEach(async () => {
    prisma = buildPrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [LeadsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<LeadsService>(LeadsService);
  });

  describe('create', () => {
    it('strips + from phone and persists the cleaned value', async () => {
      prisma.lead.findUnique.mockResolvedValue(null);
      prisma.lead.create.mockResolvedValue({
        id: 'uuid-1',
        phone: '34600112233',
        status: LeadStatus.NUEVO,
      });

      const result = await service.create({ phone: '+34600112233' } as any);

      expect(prisma.lead.findUnique).toHaveBeenCalledWith({
        where: { phone: '34600112233' },
      });
      expect(prisma.lead.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ phone: '34600112233' }),
      });
      expect(result.phone).toBe('+34600112233');
    });

    it('throws when the phone already exists', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(service.create({ phone: '+34600112233' } as any)).rejects.toThrow(
        /Ya existe un lead/i,
      );
      expect(prisma.lead.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('includes deletedAt: null in the where clause (T4.1)', async () => {
      prisma.lead.findMany.mockResolvedValue([]);
      prisma.lead.count.mockResolvedValue(0);

      await service.findAll({ page: 1, limit: 10 } as any);

      expect(prisma.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: null }),
        }),
      );
    });

    it('combines search query, status filter and soft-delete filter', async () => {
      prisma.lead.findMany.mockResolvedValue([]);
      prisma.lead.count.mockResolvedValue(0);

      await service.findAll({ page: 1, limit: 25, q: 'juan', status: LeadStatus.QUALIFIED } as any);

      const args = prisma.lead.findMany.mock.calls[0][0];
      expect(args.where.deletedAt).toBeNull();
      expect(args.where.status).toBe(LeadStatus.QUALIFIED);
      expect(args.where.OR).toBeDefined();
      expect(args.take).toBe(25);
    });
  });

  describe('findOne', () => {
    it('returns the lead when it exists and is not soft-deleted', async () => {
      prisma.lead.findFirst.mockResolvedValue({
        id: 'u1',
        phone: '34600112233',
        moodScore: null,
      });

      const result = await service.findOne('u1');

      expect(prisma.lead.findFirst).toHaveBeenCalledWith({
        where: { id: 'u1', deletedAt: null },
      });
      expect(result.phone).toBe('+34600112233');
    });

    it('throws when the lead is soft-deleted or missing', async () => {
      prisma.lead.findFirst.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toThrow(/not found/i);
    });
  });

  describe('remove', () => {
    it('performs a soft delete via update, not a destructive delete (T4.1)', async () => {
      prisma.lead.update.mockResolvedValue({ id: 'u1', deletedAt: new Date() });

      await service.remove('u1');

      expect(prisma.lead.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      });
    });
  });

  describe('getStats', () => {
    it('excludes soft-deleted leads from every counter', async () => {
      prisma.lead.count.mockResolvedValue(0);
      prisma.lead.aggregate.mockResolvedValue({ _avg: { moodScore: null } });

      await service.getStats();

      const callArgs = prisma.lead.count.mock.calls.map(call => call[0]?.where ?? {});
      for (const where of callArgs) {
        expect(where.deletedAt).toBeNull();
      }
    });
  });

  describe('updateStatus', () => {
    it('updates status and reformats phone on output', async () => {
      prisma.lead.update.mockResolvedValue({ id: 'u1', phone: '34600112233' });

      const result = await service.updateStatus('u1', LeadStatus.GANADO);

      expect(prisma.lead.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { status: LeadStatus.GANADO },
      });
      expect(result.phone).toBe('+34600112233');
    });
  });

  describe('updateWhatsAppAuth', () => {
    it('persists the flag and returns a structured response', async () => {
      prisma.lead.update.mockResolvedValue({ id: 'u1' });

      const result = await service.updateWhatsAppAuth('u1', true);

      expect(prisma.lead.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { whatsappAuthorized: true },
      });
      expect(result.success).toBe(true);
      expect(result.data.whatsappAuthorized).toBe(true);
    });
  });
});
