import { Test, TestingModule } from '@nestjs/testing';
import { LeadsService } from './leads.service';
import { PrismaService } from '../prisma/prisma.service';
import { LeadStatus } from '@prisma/client';

// T5.1 — unit tests for LeadsService.
// PR5a (B1.12): every service method now requires `tenantId`. Tests verify
// both the soft-delete semantics from T4.1 AND that the tenantId scopes
// every query (cross-tenant isolation).

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

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
    it('strips + from phone, persists cleaned value, and injects tenantId', async () => {
      prisma.lead.findUnique.mockResolvedValue(null);
      prisma.lead.create.mockResolvedValue({
        id: 'uuid-1',
        phone: '34600112233',
        status: LeadStatus.NUEVO,
      });

      const result = await service.create(
        { phone: '+34600112233' } as any,
        TENANT_A,
      );

      expect(prisma.lead.findUnique).toHaveBeenCalledWith({
        where: { phone: '34600112233' },
      });
      expect(prisma.lead.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          phone: '34600112233',
          tenantId: TENANT_A,
        }),
      });
      expect(result.phone).toBe('+34600112233');
    });

    it('throws when the phone already exists', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.create({ phone: '+34600112233' } as any, TENANT_A),
      ).rejects.toThrow(/Ya existe un lead/i);
      expect(prisma.lead.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('updates only active leads in the caller tenant and strips + from phone', async () => {
      prisma.lead.findFirst.mockResolvedValue({ id: 'u1' });
      prisma.lead.update.mockResolvedValue({
        id: 'u1',
        phone: '34600112233',
        moodScore: null,
      });

      const result = await service.update(
        'u1',
        { phone: '+34600112233' } as any,
        TENANT_A,
      );

      expect(prisma.lead.findFirst).toHaveBeenCalledWith({
        where: { id: 'u1', tenantId: TENANT_A, deletedAt: null },
        select: { id: true },
      });
      expect(prisma.lead.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { phone: '34600112233' },
      });
      expect(result.phone).toBe('+34600112233');
    });

    it('throws not-found when trying to update a missing or soft-deleted lead', async () => {
      prisma.lead.findFirst.mockResolvedValue(null);

      await expect(
        service.update('missing', { name: 'Nope' }, TENANT_A),
      ).rejects.toThrow(/not found/i);
      expect(prisma.lead.update).not.toHaveBeenCalled();
    });

    // PR5a: cross-tenant isolation. A lead that exists in TENANT_A must not
    // be reachable from TENANT_B — the service should treat it as not found
    // (404) rather than 403, to avoid leaking that the id exists.
    it('returns not-found when the lead exists in a different tenant', async () => {
      prisma.lead.findFirst.mockResolvedValue(null); // mock as if no row matches the (id, tenantId) filter

      await expect(
        service.update('lead-of-tenant-a', { name: 'X' }, TENANT_B),
      ).rejects.toThrow(/not found/i);

      expect(prisma.lead.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'lead-of-tenant-a',
          tenantId: TENANT_B,
          deletedAt: null,
        },
        select: { id: true },
      });
    });
  });

  describe('findAll', () => {
    it('includes tenantId AND deletedAt: null in the where clause', async () => {
      prisma.lead.findMany.mockResolvedValue([]);
      prisma.lead.count.mockResolvedValue(0);

      await service.findAll({ page: 1, limit: 10 } as any, TENANT_A);

      expect(prisma.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_A,
            deletedAt: null,
          }),
        }),
      );
    });

    it('combines search query, status filter, soft-delete filter, and tenantId', async () => {
      prisma.lead.findMany.mockResolvedValue([]);
      prisma.lead.count.mockResolvedValue(0);

      await service.findAll(
        {
          page: 1,
          limit: 25,
          q: 'juan',
          status: LeadStatus.QUALIFIED,
        } as any,
        TENANT_A,
      );

      const args = prisma.lead.findMany.mock.calls[0][0];
      expect(args.where.tenantId).toBe(TENANT_A);
      expect(args.where.deletedAt).toBeNull();
      expect(args.where.status).toBe(LeadStatus.QUALIFIED);
      expect(args.where.OR).toBeDefined();
      expect(args.take).toBe(25);
    });
  });

  describe('findOne', () => {
    it('returns the lead when it exists in caller tenant and is not soft-deleted', async () => {
      prisma.lead.findFirst.mockResolvedValue({
        id: 'u1',
        phone: '34600112233',
        moodScore: null,
      });

      const result = await service.findOne('u1', TENANT_A);

      expect(prisma.lead.findFirst).toHaveBeenCalledWith({
        where: { id: 'u1', tenantId: TENANT_A, deletedAt: null },
      });
      expect(result.phone).toBe('+34600112233');
    });

    it('throws when the lead is soft-deleted or missing', async () => {
      prisma.lead.findFirst.mockResolvedValue(null);

      await expect(service.findOne('missing', TENANT_A)).rejects.toThrow(
        /not found/i,
      );
    });

    it('throws not-found when the lead exists in a different tenant', async () => {
      prisma.lead.findFirst.mockResolvedValue(null);

      await expect(
        service.findOne('lead-of-tenant-a', TENANT_B),
      ).rejects.toThrow(/not found/i);

      expect(prisma.lead.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'lead-of-tenant-a',
          tenantId: TENANT_B,
          deletedAt: null,
        },
      });
    });
  });

  describe('remove', () => {
    it('performs a soft delete via update, not a destructive delete (T4.1)', async () => {
      prisma.lead.findFirst.mockResolvedValue({ id: 'u1' });
      prisma.lead.update.mockResolvedValue({ id: 'u1', deletedAt: new Date() });

      await service.remove('u1', TENANT_A);

      expect(prisma.lead.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      });
    });
  });

  describe('getStats', () => {
    it('excludes soft-deleted leads AND scopes by tenant on every counter', async () => {
      prisma.lead.count.mockResolvedValue(0);
      prisma.lead.aggregate.mockResolvedValue({ _avg: { moodScore: null } });

      await service.getStats(TENANT_A);

      const callArgs = prisma.lead.count.mock.calls.map(
        (call) => call[0]?.where ?? {},
      );
      for (const where of callArgs) {
        expect(where.deletedAt).toBeNull();
        expect(where.tenantId).toBe(TENANT_A);
      }
    });
  });

  describe('updateStatus', () => {
    it('updates status only after asserting tenant ownership', async () => {
      prisma.lead.findFirst.mockResolvedValue({ id: 'u1' });
      prisma.lead.update.mockResolvedValue({
        id: 'u1',
        phone: '34600112233',
        moodScore: null,
      });

      const result = await service.updateStatus(
        'u1',
        LeadStatus.GANADO,
        TENANT_A,
      );

      expect(prisma.lead.findFirst).toHaveBeenCalledWith({
        where: { id: 'u1', tenantId: TENANT_A, deletedAt: null },
        select: { id: true },
      });
      expect(prisma.lead.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { status: LeadStatus.GANADO },
      });
      expect(result.phone).toBe('+34600112233');
    });
  });

  describe('updateWhatsAppAuth', () => {
    it('persists the flag and returns a structured response', async () => {
      prisma.lead.findFirst.mockResolvedValue({ id: 'u1' });
      prisma.lead.update.mockResolvedValue({ id: 'u1' });

      const result = await service.updateWhatsAppAuth('u1', true, TENANT_A);

      expect(prisma.lead.findFirst).toHaveBeenCalledWith({
        where: { id: 'u1', tenantId: TENANT_A, deletedAt: null },
        select: { id: true },
      });
      expect(prisma.lead.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { whatsappAuthorized: true },
      });
      expect(result.success).toBe(true);
      expect(result.data.whatsappAuthorized).toBe(true);
    });
  });
});
