/**
 * T0.4-ter: HMAC service-to-service authentication for whatsapp-service.
 *
 * Shape of signed requests (shared by dashboard proxy, API Nest, and any
 * other backend caller):
 *
 *   headers:
 *     x-service-timestamp: <epoch ms>
 *     x-service-signature: sha256=<hex HMAC-SHA256 of `timestamp + "." + rawBody`>
 *
 * The receiver rebuilds the HMAC from the raw body bytes and compares with
 * `timingSafeEqual`. Requests older than 5 minutes are rejected to protect
 * against replay. The helper `signServiceRequest` below is duplicated
 * (intentionally, ~15 lines) in `apps/dashboard/lib/service-auth.ts` and
 * `apps/api/src/whatsapp/service-auth.ts` so the three apps stay decoupled
 * without a new workspace package. If the three ever diverge the HMAC mismatch
 * makes the bug loud and local.
 */
import type { NextFunction, Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { logger } from '../utils/logger';

const MAX_SIGNATURE_AGE_MS = 5 * 60 * 1000;
const SIGNATURE_PREFIX = 'sha256=';

// Routes that stay public (liveness/readiness). Everything else requires a
// valid HMAC signature. The check is `startsWith` so both `/health` and
// `/api/health` match after the `/api` mount.
const PUBLIC_PATH_PREFIXES = ['/health', '/api/health'];

export function signServiceRequest(
  body: string,
  secret: string
): { timestamp: string; signature: string } {
  const timestamp = Date.now().toString();
  const payload = `${timestamp}.${body}`;
  const hex = createHmac('sha256', secret).update(payload).digest('hex');
  return { timestamp, signature: `${SIGNATURE_PREFIX}${hex}` };
}

export function verifyServiceSignature(req: Request, res: Response, next: NextFunction): void {
  try {
    // Skip auth entirely in automated tests so the suite does not need a secret.
    if (process.env.NODE_ENV === 'test') {
      next();
      return;
    }

    // Public liveness endpoints stay open so monitoring can reach them.
    if (PUBLIC_PATH_PREFIXES.some(prefix => req.path.startsWith(prefix))) {
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

    // express.json({ verify }) stores the raw buffer here; for requests without
    // body (GET/DELETE) rawBody may be undefined, which signs as empty string.
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody?.toString('utf8') ?? '';
    const expectedHex = createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');
    const expected = `${SIGNATURE_PREFIX}${expectedHex}`;

    const received = Buffer.from(signature);
    const expectedBuf = Buffer.from(expected);
    if (received.length !== expectedBuf.length || !timingSafeEqual(received, expectedBuf)) {
      res.status(401).json({ success: false, error: 'invalid service signature' });
      return;
    }

    next();
  } catch (error) {
    logger.error('❌ [AUTH] verifyServiceSignature failed unexpectedly:', error);
    res.status(500).json({ success: false, error: 'signature verification failed' });
  }
}
