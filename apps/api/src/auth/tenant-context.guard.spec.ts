import { ForbiddenException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { TenantContextGuard } from './tenant-context.guard';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedRequest } from './clerk-auth.guard';

// PR5a (B1.12): unit tests for TenantContextGuard. Verifies that the guard:
//   1. blocks requests with no orgId in the session (403 — no active org)
//   2. blocks requests where the orgId has no Tenant row yet (403)
//   3. resolves orgId -> tenantId on the happy path and exposes it on req
//   4. cache hit avoids an extra DB lookup on the second call within TTL

const ORG_VALID = 'org_valid_123';
const ORG_UNKNOWN = 'org_unknown_456';
const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function makeContext(request: AuthenticatedRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }) as any,
  } as ExecutionContext;
}

describe('TenantContextGuard', () => {
  let guard: TenantContextGuard;
  let prisma: { tenant: { findUnique: jest.Mock } };

  beforeEach(() => {
    prisma = { tenant: { findUnique: jest.fn() } };
    guard = new TenantContextGuard(prisma as unknown as PrismaService);
    TenantContextGuard.__resetCacheForTests();
  });

  it('throws ForbiddenException when no orgId is present on the request', async () => {
    const req = { user: { userId: 'u1' } } as AuthenticatedRequest;

    await expect(guard.canActivate(makeContext(req))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
  });

  it('throws ForbiddenException when the orgId has no Tenant row', async () => {
    prisma.tenant.findUnique.mockResolvedValue(null);
    const req = {
      user: { userId: 'u1', orgId: ORG_UNKNOWN },
    } as AuthenticatedRequest;

    await expect(guard.canActivate(makeContext(req))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.tenant.findUnique).toHaveBeenCalledWith({
      where: { clerkOrgId: ORG_UNKNOWN },
      select: { id: true },
    });
  });

  it('exposes tenantId on req.user when the orgId resolves to a Tenant', async () => {
    prisma.tenant.findUnique.mockResolvedValue({ id: TENANT_ID });
    const req = {
      user: { userId: 'u1', orgId: ORG_VALID },
    } as AuthenticatedRequest;

    const ok = await guard.canActivate(makeContext(req));

    expect(ok).toBe(true);
    expect(req.user!.tenantId).toBe(TENANT_ID);
    expect(prisma.tenant.findUnique).toHaveBeenCalledTimes(1);
  });

  it('uses the in-memory cache on a second call within TTL (no extra DB hit)', async () => {
    prisma.tenant.findUnique.mockResolvedValue({ id: TENANT_ID });

    const reqA = {
      user: { userId: 'u1', orgId: ORG_VALID },
    } as AuthenticatedRequest;
    const reqB = {
      user: { userId: 'u2', orgId: ORG_VALID },
    } as AuthenticatedRequest;

    await guard.canActivate(makeContext(reqA));
    await guard.canActivate(makeContext(reqB));

    expect(prisma.tenant.findUnique).toHaveBeenCalledTimes(1);
    expect(reqA.user!.tenantId).toBe(TENANT_ID);
    expect(reqB.user!.tenantId).toBe(TENANT_ID);
  });
});
