import { ConfigService } from '@nestjs/config';
import { ClerkOrganizationsService } from './clerk-organizations.service';

const updateOrganizationMetadata = jest.fn();

jest.mock('@clerk/backend', () => ({
  Clerk: jest.fn(() => ({
    organizations: {
      updateOrganizationMetadata,
    },
  })),
}));

describe('ClerkOrganizationsService', () => {
  const tenant = {
    id: '11111111-1111-4111-8111-111111111111',
    clerkOrgId: 'org_123',
    name: 'EscortsHub',
  };

  let prisma: {
    tenant: {
      upsert: jest.Mock;
      deleteMany: jest.Mock;
    };
  };
  let service: ClerkOrganizationsService;

  beforeEach(() => {
    jest.clearAllMocks();

    prisma = {
      tenant: {
        upsert: jest.fn().mockResolvedValue(tenant),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    service = new ClerkOrganizationsService(
      prisma as any,
      { get: jest.fn().mockReturnValue('sk_test_123') } as unknown as ConfigService,
    );
  });

  it('upserts a tenant and patches Clerk public metadata on organization.created', async () => {
    const result = await service.handleWebhook({
      type: 'organization.created',
      data: {
        id: 'org_123',
        name: 'EscortsHub',
        public_metadata: {},
      },
    });

    expect(result).toEqual({ action: 'synced', tenantId: tenant.id });
    expect(prisma.tenant.upsert).toHaveBeenCalledWith({
      where: { clerkOrgId: 'org_123' },
      create: { clerkOrgId: 'org_123', name: 'EscortsHub' },
      update: { name: 'EscortsHub' },
    });
    expect(updateOrganizationMetadata).toHaveBeenCalledWith('org_123', {
      publicMetadata: { tenant_id: tenant.id },
    });
  });

  it('does not patch Clerk metadata when tenant_id is already present', async () => {
    await service.handleWebhook({
      type: 'organization.updated',
      data: {
        id: 'org_123',
        name: 'EscortsHub',
        public_metadata: { tenant_id: tenant.id },
      },
    });

    expect(prisma.tenant.upsert).toHaveBeenCalledTimes(1);
    expect(updateOrganizationMetadata).not.toHaveBeenCalled();
  });

  it('deletes the local tenant when Clerk sends organization.deleted', async () => {
    const result = await service.handleWebhook({
      type: 'organization.deleted',
      data: {
        id: 'org_123',
        deleted: true,
      },
    });

    expect(result).toEqual({ action: 'deleted' });
    expect(prisma.tenant.deleteMany).toHaveBeenCalledWith({
      where: { clerkOrgId: 'org_123' },
    });
  });
});
