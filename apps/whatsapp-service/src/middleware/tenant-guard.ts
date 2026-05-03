/**
 * PR5a-ter (Codex review #2): tenant guards for routes that take a
 * sessionId from URL or body. The HMAC middleware (auth.ts) already
 * validates that the caller signed with a real tenantId; these guards
 * ensure the SESSION the caller is operating on belongs to that tenant.
 *
 * Pattern:
 *   router.post(
 *     '/sessions/:sessionId/backup',
 *     requireTenantContext,           // 403 if no tenant on request
 *     requireSessionOwnership,        // 404 if session belongs elsewhere
 *     handler
 *   );
 *
 * Cross-tenant lookups always return 404 (not 403). 403 would confirm the
 * id exists in some other tenant — an enumeration leak. 404 keeps it
 * indistinguishable from a non-existent id.
 */
import type { NextFunction, Request, Response } from 'express';
import SessionPersistenceService from '../services/SessionPersistenceService';
import { logger } from '../utils/logger';

export function requireTenantContext(req: Request, res: Response, next: NextFunction): void {
  if (!req.tenantId) {
    res.status(403).json({ success: false, error: 'tenant context required' });
    return;
  }
  next();
}

/**
 * Reads sessionId from URL params (`req.params.sessionId`) or body
 * (`req.body.sessionId`) — in that order — and asserts that
 * `req.tenantId` owns it. Routes that read sessionId from a different
 * field can compose `assertSessionOwnership` directly.
 */
export async function requireSessionOwnership(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.tenantId) {
    res.status(403).json({ success: false, error: 'tenant context required' });
    return;
  }

  const sessionId =
    (req.params as { sessionId?: string }).sessionId ??
    (req.body as { sessionId?: string } | undefined)?.sessionId;

  if (!sessionId) {
    res.status(400).json({ success: false, error: 'sessionId is required' });
    return;
  }

  const ok = await assertSessionOwnership(sessionId, req.tenantId);
  if (!ok) {
    res.status(404).json({ success: false, error: 'Session not found' });
    return;
  }
  next();
}

/**
 * Programmatic helper for handlers that need to assert ownership against
 * a specific sessionId not coming from `req.params.sessionId`. Returns
 * `true` only when the session exists AND belongs to `tenantId`.
 */
export async function assertSessionOwnership(
  sessionId: string,
  tenantId: string
): Promise<boolean> {
  const owner = await SessionPersistenceService.getSessionTenantId(sessionId);
  if (owner === null) return false;
  if (owner !== tenantId) {
    logger.warn(
      `[TENANT-GUARD] tenant ${tenantId} attempted to access session ${sessionId} owned by ${owner}`
    );
    return false;
  }
  return true;
}

/**
 * PR5a-quinquies (Codex review #4): operator-only guard for endpoints
 * that mutate or read GLOBAL state shared across tenants (e.g.
 * /ai/switch, /system/variables PUT, /sessions/stats overall counts).
 *
 * Today there is no role/admin claim in the HMAC envelope, so the safe
 * default is to BLOCK these endpoints from tenant-scoped HTTP. The lock
 * is opened by setting `WHATSAPP_OPERATOR_HMAC_TENANT_ID` to a single
 * tenantId in env; that tenant's HMAC is treated as the operator. PR5b
 * will replace this with a real role claim signed into the HMAC.
 *
 * Until then, the dashboard cannot accidentally invoke a global mutation
 * because the dashboard signs with the user's tenantId, not the operator
 * sentinel.
 */
export function requireOperatorRole(req: Request, res: Response, next: NextFunction): void {
  const operatorTenant = process.env.WHATSAPP_OPERATOR_HMAC_TENANT_ID?.trim();
  if (!operatorTenant) {
    res.status(403).json({
      success: false,
      error:
        'operator role not configured (WHATSAPP_OPERATOR_HMAC_TENANT_ID unset) — endpoint disabled',
    });
    return;
  }
  if (!req.tenantId || req.tenantId !== operatorTenant) {
    res.status(403).json({ success: false, error: 'operator role required' });
    return;
  }
  next();
}
