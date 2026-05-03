import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedRequest } from './clerk-auth.guard';

interface CacheEntry {
  tenantId: string;
  expiresAt: number;
}

const TENANT_CACHE_TTL_MS = 60_000;

/**
 * PR5a (B1.12 + B1.2(a) Vía B): resolves the active Clerk organization
 * (orgId, populated by ClerkAuthGuard from the JWT `org_id` claim) into the
 * internal Tenant.id by lookup against the Tenant table, with a small
 * in-memory TTL cache to avoid hitting Postgres on every request.
 *
 * Vía B (lookup server-side) is the default because the Student/Free Clerk
 * plan does not allow saving custom session token claims — Vía A
 * (`tenant_id` injected by Clerk into the JWT) is reserved for paid plans
 * and would replace this lookup with a direct payload read.
 *
 * MUST be applied AFTER ClerkAuthGuard, e.g.
 *   `@UseGuards(ClerkAuthGuard, TenantContextGuard)`.
 */
@Injectable()
export class TenantContextGuard implements CanActivate {
  // Single-process cache. Acceptable while api runs under PM2 single instance;
  // when we move to multi-replica the cache should move to Redis (Phase C).
  private static cache = new Map<string, CacheEntry>();

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const orgId = request.user?.orgId;

    if (!orgId) {
      // No active org in the session — block tenant-scoped resources.
      // Frontend should redirect to /select-org via dashboard middleware
      // before the request reaches the API; if it didn't, this is the
      // server-side last line of defense.
      throw new ForbiddenException(
        'No active organization. Select an organization to continue.',
      );
    }

    const tenantId = await this.resolveTenantId(orgId);
    if (!tenantId) {
      // orgId from a real Clerk session but Tenant row not yet created
      // (webhook race or backfill not run). Block — better to fail loud
      // than to silently leak data across tenants.
      throw new ForbiddenException(
        'Tenant not provisioned for this organization.',
      );
    }

    request.user = { ...request.user, userId: request.user!.userId, tenantId };
    return true;
  }

  private async resolveTenantId(orgId: string): Promise<string | null> {
    const now = Date.now();
    const cached = TenantContextGuard.cache.get(orgId);
    if (cached && cached.expiresAt > now) {
      return cached.tenantId;
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { clerkOrgId: orgId },
      select: { id: true },
    });

    if (!tenant) {
      return null;
    }

    TenantContextGuard.cache.set(orgId, {
      tenantId: tenant.id,
      expiresAt: now + TENANT_CACHE_TTL_MS,
    });
    return tenant.id;
  }

  /**
   * Test-only helper to reset the cache between specs. Production callers
   * should not depend on this — TTL handles invalidation.
   */
  static __resetCacheForTests(): void {
    TenantContextGuard.cache.clear();
  }
}
