/**
 * HMAC Guard for the webhook endpoint. Accepts only requests signed by the
 * whatsapp-service using the shared secret (WHATSAPP_SERVICE_HMAC_SECRET).
 *
 * The signature format mirrors `apps/whatsapp-service/src/middleware/auth.ts`:
 *   x-service-timestamp: <epoch ms>
 *   x-service-signature: sha256=<hex HMAC-SHA256 of `timestamp + "." + rawBody`>
 *
 * Requires main.ts to capture the raw body into req.rawBody so we can
 * recompute the HMAC exactly.
 */
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

const MAX_SIGNATURE_AGE_MS = 5 * 60 * 1000;
const SIGNATURE_PREFIX = 'sha256=';

@Injectable()
export class HmacAuthGuard implements CanActivate {
  private readonly logger = new Logger(HmacAuthGuard.name);

  canActivate(context: ExecutionContext): boolean {
    if (process.env.NODE_ENV === 'test') {
      return true;
    }

    const req = context.switchToHttp().getRequest<
      Request & { rawBody?: Buffer }
    >();

    const secret = process.env.WHATSAPP_SERVICE_HMAC_SECRET;
    if (!secret) {
      this.logger.error(
        'WHATSAPP_SERVICE_HMAC_SECRET is not configured — rejecting webhook',
      );
      throw new InternalServerErrorException('service auth misconfigured');
    }

    const timestamp = req.header('x-service-timestamp');
    const signature = req.header('x-service-signature');
    if (!timestamp || !signature) {
      throw new UnauthorizedException(
        'missing x-service-timestamp or x-service-signature',
      );
    }

    const ts = Number.parseInt(timestamp, 10);
    if (
      !Number.isFinite(ts) ||
      Math.abs(Date.now() - ts) > MAX_SIGNATURE_AGE_MS
    ) {
      throw new UnauthorizedException(
        'signature timestamp out of acceptable window',
      );
    }

    const rawBody = req.rawBody?.toString('utf8') ?? '';
    const expectedHex = createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');
    const expected = `${SIGNATURE_PREFIX}${expectedHex}`;

    const received = Buffer.from(signature);
    const expectedBuf = Buffer.from(expected);
    if (
      received.length !== expectedBuf.length ||
      !timingSafeEqual(received, expectedBuf)
    ) {
      throw new UnauthorizedException('invalid service signature');
    }

    return true;
  }
}
