import { Test, TestingModule } from '@nestjs/testing';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';
import { WhitelistService } from './whitelist.service';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { TenantContextGuard } from '../auth/tenant-context.guard';
import { HmacAuthGuard } from './hmac-auth.guard';

// T5.2 — unit tests for the Nest webhook controller. Focuses on the event
// dispatch table. Both guards (Clerk on management endpoints, HMAC on the
// webhook) are overridden to always pass — they are covered by their own
// unit tests and by the runtime integration tests.

describe('WhatsAppController', () => {
  let controller: WhatsAppController;
  let whatsAppService: jest.Mocked<WhatsAppService>;

  beforeEach(async () => {
    const whatsAppServiceMock: Partial<jest.Mocked<WhatsAppService>> = {
      handleIncomingMessage: jest.fn(),
      handleSessionAuthenticated: jest.fn(),
      handleSessionDisconnected: jest.fn(),
      handleStatusChange: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WhatsAppController],
      providers: [
        { provide: WhatsAppService, useValue: whatsAppServiceMock },
        { provide: WhitelistService, useValue: {} },
      ],
    })
      .overrideGuard(ClerkAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(TenantContextGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(HmacAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<WhatsAppController>(WhatsAppController);
    whatsAppService = module.get(
      WhatsAppService,
    ) as jest.Mocked<WhatsAppService>;
  });

  describe('handleWebhook', () => {
    const basePayload = {
      event: 'message' as const,
      sessionId: 'session-1',
      data: { body: 'hello' },
      timestamp: new Date().toISOString(),
    };

    it('dispatches "message" events to handleIncomingMessage', async () => {
      const result = await controller.handleWebhook(basePayload);

      expect(whatsAppService.handleIncomingMessage).toHaveBeenCalledWith(
        'session-1',
        { body: 'hello' },
      );
      expect(result).toEqual({
        success: true,
        message: 'Webhook processed successfully',
      });
    });

    it('dispatches "authenticated" events to handleSessionAuthenticated', async () => {
      await controller.handleWebhook({
        ...basePayload,
        event: 'authenticated',
      });

      expect(whatsAppService.handleSessionAuthenticated).toHaveBeenCalledWith(
        'session-1',
        basePayload.data,
      );
    });

    it('dispatches "disconnected" events to handleSessionDisconnected', async () => {
      await controller.handleWebhook({
        ...basePayload,
        event: 'disconnected',
      });

      expect(whatsAppService.handleSessionDisconnected).toHaveBeenCalledWith(
        'session-1',
        basePayload.data,
      );
    });

    it('dispatches "status_change" events to handleStatusChange (T2.3 plumbing)', async () => {
      await controller.handleWebhook({
        ...basePayload,
        event: 'status_change',
        data: { status: 'auth_failure' },
      });

      expect(whatsAppService.handleStatusChange).toHaveBeenCalledWith(
        'session-1',
        {
          status: 'auth_failure',
        },
      );
    });

    it('returns success on "qr_updated" without invoking any service method', async () => {
      const result = await controller.handleWebhook({
        ...basePayload,
        event: 'qr_updated',
        data: { qrCode: 'abc' },
      });

      expect(whatsAppService.handleIncomingMessage).not.toHaveBeenCalled();
      expect(whatsAppService.handleSessionAuthenticated).not.toHaveBeenCalled();
      expect(whatsAppService.handleSessionDisconnected).not.toHaveBeenCalled();
      expect(whatsAppService.handleStatusChange).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        message: 'Webhook processed successfully',
      });
    });
  });
});
