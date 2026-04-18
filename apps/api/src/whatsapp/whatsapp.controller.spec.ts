import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';
import { WhitelistService } from './whitelist.service';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';

// T5.2 — unit tests for the Nest webhook controller. Focuses on the
// boundary behaviour: the header guard and the event dispatch table. The
// handler methods themselves (handleIncomingMessage / handleSession*) are
// mocked — they are unit-tested at the service level, not here.

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

    it('rejects requests without the x-whatsapp-service header', async () => {
      await expect(controller.handleWebhook(basePayload, '')).rejects.toThrow(
        BadRequestException,
      );
      expect(whatsAppService.handleIncomingMessage).not.toHaveBeenCalled();
    });

    it('dispatches "message" events to handleIncomingMessage', async () => {
      const result = await controller.handleWebhook(
        basePayload,
        'whatsapp-service',
      );

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
      await controller.handleWebhook(
        { ...basePayload, event: 'authenticated' },
        'whatsapp-service',
      );

      expect(whatsAppService.handleSessionAuthenticated).toHaveBeenCalledWith(
        'session-1',
        basePayload.data,
      );
    });

    it('dispatches "disconnected" events to handleSessionDisconnected', async () => {
      await controller.handleWebhook(
        { ...basePayload, event: 'disconnected' },
        'whatsapp-service',
      );

      expect(whatsAppService.handleSessionDisconnected).toHaveBeenCalledWith(
        'session-1',
        basePayload.data,
      );
    });

    it('dispatches "status_change" events to handleStatusChange (T2.3 plumbing)', async () => {
      await controller.handleWebhook(
        {
          ...basePayload,
          event: 'status_change',
          data: { status: 'auth_failure' },
        },
        'whatsapp-service',
      );

      expect(whatsAppService.handleStatusChange).toHaveBeenCalledWith(
        'session-1',
        {
          status: 'auth_failure',
        },
      );
    });

    it('returns success on "qr_updated" without invoking any service method', async () => {
      const result = await controller.handleWebhook(
        { ...basePayload, event: 'qr_updated', data: { qrCode: 'abc' } },
        'whatsapp-service',
      );

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
