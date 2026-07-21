import { Test, TestingModule } from '@nestjs/testing';
import { WhatsAppService } from './whatsapp.service';
import { WhitelistService } from './whitelist.service';
import { PrismaService } from '../prisma/prisma.service';
import { LeadStatus } from '@prisma/client';

describe('WhatsAppService tenant-scope', () => {
  let service: WhatsAppService;
  let prisma: {
    lead: { findFirst: jest.Mock; create: jest.Mock; updateMany: jest.Mock };
    message: { create: jest.Mock };
    whatsAppSession: {
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const SESSION_ID = 'test-session';
  const LEAD_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  beforeEach(async () => {
    prisma = {
      lead: {
        findFirst: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      message: { create: jest.fn() },
      whatsAppSession: {
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsAppService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: WhitelistService,
          useValue: {
            isNumberAuthorized: jest
              .fn()
              .mockResolvedValue({ allowed: true, reason: 'test' }),
          },
        },
      ],
    }).compile();

    service = module.get<WhatsAppService>(WhatsAppService);
    WhatsAppService.__resetCachesForTests();
  });

  describe('handleIncomingMessage — lead.updateMany with tenantId', () => {
    beforeEach(() => {
      prisma.whatsAppSession.findUnique.mockResolvedValue({
        tenantId: TENANT_ID,
      });
    });

    it('uses updateMany with tenantId when lead status is NUEVO', async () => {
      prisma.lead.findFirst.mockResolvedValue({
        id: LEAD_ID,
        status: LeadStatus.NUEVO,
        messages: [],
      });

      await service.handleIncomingMessage(SESSION_ID, {
        id: 'msg-1',
        from: '5491155556666@c.us',
        to: '',
        body: 'hola',
        timestamp: Date.now(),
        type: 'chat',
        isGroup: false,
        fromMe: false,
      });

      expect(prisma.lead.updateMany).toHaveBeenCalledWith({
        where: { id: LEAD_ID, tenantId: TENANT_ID, deletedAt: null },
        data: expect.objectContaining({
          status: LeadStatus.CONTACTADO,
        }),
      });
    });

    it('uses updateMany with tenantId when lead status is not NUEVO', async () => {
      prisma.lead.findFirst.mockResolvedValue({
        id: LEAD_ID,
        status: LeadStatus.CONTACTADO,
        messages: [],
      });

      await service.handleIncomingMessage(SESSION_ID, {
        id: 'msg-2',
        from: '5491155556666@c.us',
        to: '',
        body: 'hola de nuevo',
        timestamp: Date.now(),
        type: 'chat',
        isGroup: false,
        fromMe: false,
      });

      expect(prisma.lead.updateMany).toHaveBeenCalledWith({
        where: { id: LEAD_ID, tenantId: TENANT_ID, deletedAt: null },
        data: expect.objectContaining({
          lastContact: expect.any(Date),
        }),
      });
    });
  });

  describe('handleSessionAuthenticated — scoped session update', () => {
    it('uses updateMany with tenantId when session has tenant', async () => {
      prisma.whatsAppSession.findUnique.mockResolvedValue({
        tenantId: TENANT_ID,
      });

      await service.handleSessionAuthenticated(SESSION_ID, {
        number: '+5491155556666',
      });

      expect(prisma.whatsAppSession.updateMany).toHaveBeenCalledWith({
        where: { sessionId: SESSION_ID, tenantId: TENANT_ID },
        data: expect.objectContaining({ status: 'authenticated' }),
      });
      expect(prisma.whatsAppSession.update).not.toHaveBeenCalled();
    });

    it('falls back to unscoped update when session has no tenantId', async () => {
      prisma.whatsAppSession.findUnique.mockResolvedValue({ tenantId: null });

      await service.handleSessionAuthenticated(SESSION_ID, {});

      expect(prisma.whatsAppSession.update).toHaveBeenCalledWith({
        where: { sessionId: SESSION_ID },
        data: expect.objectContaining({ status: 'authenticated' }),
      });
      expect(prisma.whatsAppSession.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('handleSessionDisconnected — scoped session update', () => {
    it('uses updateMany with tenantId when session has tenant', async () => {
      prisma.whatsAppSession.findUnique.mockResolvedValue({
        tenantId: TENANT_ID,
      });

      await service.handleSessionDisconnected(SESSION_ID, { reason: 'logout' });

      expect(prisma.whatsAppSession.updateMany).toHaveBeenCalledWith({
        where: { sessionId: SESSION_ID, tenantId: TENANT_ID },
        data: expect.objectContaining({ status: 'disconnected' }),
      });
    });
  });

  describe('handleStatusChange — scoped session update', () => {
    it('uses updateMany with tenantId when session has tenant', async () => {
      prisma.whatsAppSession.findUnique.mockResolvedValue({
        tenantId: TENANT_ID,
      });

      await service.handleStatusChange(SESSION_ID, {
        status: 'auth_failure',
        message: 'expired',
      });

      expect(prisma.whatsAppSession.updateMany).toHaveBeenCalledWith({
        where: { sessionId: SESSION_ID, tenantId: TENANT_ID },
        data: expect.objectContaining({
          status: 'auth_failure',
          lastError: 'expired',
        }),
      });
    });
  });
});
