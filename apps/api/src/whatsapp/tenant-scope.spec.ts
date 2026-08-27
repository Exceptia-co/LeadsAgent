import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';

function makeService(sessionTenantId: string | null) {
  const prisma = {
    whatsAppSession: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          sessionTenantId === null ? null : { tenantId: sessionTenantId },
        ),
    },
  };
  return new WhatsAppService(prisma as any);
}

beforeEach(() => WhatsAppService.__resetCachesForTests());

describe('assertSessionTenant', () => {
  it('accepts a session the tenant owns', async () => {
    await expect(
      makeService('tenant-1').assertSessionTenant('s1', 'tenant-1'),
    ).resolves.toBeUndefined();
  });

  it('refuses a session that belongs to another tenant', async () => {
    await expect(
      makeService('tenant-2').assertSessionTenant('s1', 'tenant-1'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('refuses a session that does not exist', async () => {
    await expect(
      makeService(null).assertSessionTenant('s1', 'tenant-1'),
    ).rejects.toThrow(NotFoundException);
  });
});
