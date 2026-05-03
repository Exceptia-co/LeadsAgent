/**
 * PR5a-bis (Codex finding #1): server-side helper to resolve the active
 * Clerk org -> internal Tenant.id from the dashboard.
 *
 * Used by the WhatsApp proxy route to inject a trusted x-service-tenant-id
 * header (signed by HMAC) so the whatsapp-service can scope every list /
 * get / send / delete by tenant.
 *
 * Cache: in-memory Map with TTL 60s. Single Vercel function instance
 * scope; we accept brief staleness in exchange for not hitting Postgres
 * on every proxied call. When dashboard goes multi-region the cache moves
 * to Vercel KV / Upstash.
 */
import { auth } from "@clerk/nextjs/server";
import { PrismaClient } from "@leadcrm/db";

const TENANT_CACHE_TTL_MS = 60_000;
type CacheEntry = { tenantId: string | null; expiresAt: number };
const tenantCache = new Map<string, CacheEntry>();

// Lazy singleton so we don't open a Postgres pool per invocation.
let prismaSingleton: PrismaClient | null = null;
function getPrisma(): PrismaClient {
  if (!prismaSingleton) {
    prismaSingleton = new PrismaClient();
  }
  return prismaSingleton;
}

/**
 * Returns the active org's Tenant.id, or null if:
 *  - the request has no active org (user must select one)
 *  - the org has no Tenant row yet (webhook race or missing backfill)
 */
export async function resolveActiveTenantId(): Promise<string | null> {
  const { orgId } = await auth();
  if (!orgId) return null;

  const now = Date.now();
  const cached = tenantCache.get(orgId);
  if (cached && cached.expiresAt > now) {
    return cached.tenantId;
  }

  const tenant = await getPrisma().tenant.findUnique({
    where: { clerkOrgId: orgId },
    select: { id: true },
  });

  const tenantId = tenant?.id ?? null;
  tenantCache.set(orgId, {
    tenantId,
    expiresAt: now + TENANT_CACHE_TTL_MS,
  });
  return tenantId;
}
