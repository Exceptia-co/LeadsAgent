/**
 * T0.4-ter (PR5a-bis update): HMAC service-to-service authentication for
 * whatsapp-service.
 *
 * Shape of signed requests (shared by dashboard proxy, API Nest, and any
 * other backend caller):
 *
 *   headers:
 *     x-service-timestamp:  <epoch ms>
 *     x-service-tenant-id:  <UUID | "" for /health public probes>
 *     x-service-signature:  sha256=<hex HMAC-SHA256 of `${timestamp}.${tenantId}.${body}`>
 *
 * The receiver rebuilds the HMAC from the raw body bytes plus the
 * tenant-id header and compares with `timingSafeEqual`. The tenantId is
 * INSIDE the signed payload so a MITM can't swap the tenant header without
 * invalidating the signature.
 *
 * Tenant-scoped paths (everything outside PUBLIC_PATH_PREFIXES) require a
 * non-empty UUID tenant id. /health stays open with empty tenantId so
 * monitoring still works without authoritative org context.
 */
import type { NextFunction, Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { logger } from '../utils/logger';

const MAX_SIGNATURE_AGE_MS = 5 * 60 * 1000;
const SIGNATURE_PREFIX = 'sha256=';
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PUBLIC_PATH_PREFIXES = ['/health', '/api/health'];

// Express module augmentation: request.tenantId is set by this middleware
// after a successful HMAC verification so handlers can use it directly.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      tenantId?: string;
    }
  }
}

export function signServiceRequest(
  body: string,
  secret: string,
  tenantId: string = ''
): { timestamp: string; tenantId: string; signature: string } {
  const timestamp = Date.now().toString();
  const payload = `${timestamp}.${tenantId}.${body}`;
  const hex = createHmac('sha256', secret).update(payload).digest('hex');
  return {
    timestamp,
    tenantId,
    signature: `${SIGNATURE_PREFIX}${hex}`,
  };
}

export function verifyServiceSignature(req: Request, res: Response, next: NextFunction): void {
  try {
    if (process.env.NODE_ENV === 'test') {
      next();
      return;
    }

    const isPublicPath = PUBLIC_PATH_PREFIXES.some(prefix =>
      req.path.startsWith(prefix)
    );
    if (isPublicPath) {
      next();
      return;
    }

    const secret = process.env.WHATSAPP_SERVICE_HMAC_SECRET;
    if (!secret) {
      logger.error(
        '❌ [AUTH] WHATSAPP_SERVICE_HMAC_SECRET is not configured — rejecting all requests.'
      );
      res.status(500).json({ success: false, error: 'service auth misconfigured' });
      return;
    }

    const timestamp = req.header('x-service-timestamp');
    const signature = req.header('x-service-signature');
    // PR5a-bis: tenant-id header. May be empty string only on public
    // paths (already returned above). For tenant-scoped paths, an empty
    // string is rejected after signature verification.
    const tenantHeader = req.header('x-service-tenant-id') ?? '';

    if (!timestamp || !signature) {
      res.status(401).json({
        success: false,
        error: 'missing x-service-timestamp or x-service-signature',
      });
      return;
    }

    const ts = Number.parseInt(timestamp, 10);
    if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > MAX_SIGNATURE_AGE_MS) {
      res.status(401).json({
        success: false,
        error: 'signature timestamp out of acceptable window',
      });
      return;
    }

    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody?.toString('utf8') ?? '';
    const expectedHex = createHmac('sha256', secret)
      .update(`${timestamp}.${tenantHeader}.${rawBody}`)
      .digest('hex');
    const expected = `${SIGNATURE_PREFIX}${expectedHex}`;

    const received = Buffer.from(signature);
    const expectedBuf = Buffer.from(expected);
    if (received.length !== expectedBuf.length || !timingSafeEqual(received, expectedBuf)) {
      res.status(401).json({ success: false, error: 'invalid service signature' });
      return;
    }

    // Signature OK. Now enforce that tenant-scoped paths carry a real
    // UUID. The signature already binds whatever tenantHeader was sent,
    // so this check rejects callers that authenticated with an empty
    // tenant claim against a tenant-scoped resource.
    if (!tenantHeader || !UUID_RE.test(tenantHeader)) {
      res.status(403).json({
        success: false,
        error: 'tenant context required for this endpoint',
      });
      return;
    }

    req.tenantId = tenantHeader;
    next();
  } catch (error) {
    logger.error('❌ [AUTH] verifyServiceSignature failed unexpectedly:', error);
    res.status(500).json({ success: false, error: 'signature verification failed' });
  }
}
