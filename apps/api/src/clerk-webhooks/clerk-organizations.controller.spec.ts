import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Webhook } from 'svix';
import { ClerkOrganizationsController } from './clerk-organizations.controller';
import { ClerkOrganizationsService } from './clerk-organizations.service';

describe('ClerkOrganizationsController', () => {
  const secret = 'whsec_dGVzdF9zZWNyZXQ=';
  const event = {
    type: 'organization.created',
    data: {
      id: 'org_123',
      name: 'EscortsHub',
      public_metadata: {},
    },
  };

  let service: { handleWebhook: jest.Mock };
  let config: { get: jest.Mock };
  let controller: ClerkOrganizationsController;

  beforeEach(() => {
    service = {
      handleWebhook: jest.fn().mockResolvedValue({
        action: 'synced',
        tenantId: '11111111-1111-4111-8111-111111111111',
      }),
    };
    config = {
      get: jest.fn().mockReturnValue(secret),
    };
    controller = new ClerkOrganizationsController(
      service as unknown as ClerkOrganizationsService,
      config as unknown as ConfigService,
    );
  });

  it('verifies the Svix signature and dispatches the event', async () => {
    const payload = Buffer.from(JSON.stringify(event));
    const timestamp = new Date();
    const msgId = 'msg_123';
    const signature = new Webhook(secret).sign(msgId, timestamp, payload);

    const result = await controller.handleOrganizationWebhook({
      rawBody: payload,
      headers: {
        'svix-id': msgId,
        'svix-timestamp': Math.floor(timestamp.getTime() / 1000).toString(),
        'svix-signature': signature,
      },
    } as any);

    expect(service.handleWebhook).toHaveBeenCalledWith(event);
    expect(result).toEqual({
      success: true,
      data: {
        action: 'synced',
        tenantId: '11111111-1111-4111-8111-111111111111',
      },
    });
  });

  it('rejects requests without raw body', async () => {
    await expect(
      controller.handleOrganizationWebhook({ headers: {} } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('fails loudly when CLERK_ORG_WEBHOOK_SECRET is missing', async () => {
    config.get.mockReturnValue(undefined);

    await expect(
      controller.handleOrganizationWebhook({
        rawBody: Buffer.from(JSON.stringify(event)),
        headers: {},
      } as any),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});
