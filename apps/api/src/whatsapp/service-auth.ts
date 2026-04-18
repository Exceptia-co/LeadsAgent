/**
 * T0.4-ter: API Nest helper to sign outbound requests to the
 * whatsapp-service. Mirrors exactly `apps/dashboard/lib/service-auth.ts`
 * and the verifier at `apps/whatsapp-service/src/middleware/auth.ts`.
 * If this drifts, HMAC mismatches fail loud and locally.
 */
import { createHmac } from 'node:crypto';

export interface SignedHeaders {
  'x-service-timestamp': string;
  'x-service-signature': string;
}

export function signServiceRequest(
  body: string,
  secret: string,
): SignedHeaders {
  const timestamp = Date.now().toString();
  const payload = `${timestamp}.${body}`;
  const hex = createHmac('sha256', secret).update(payload).digest('hex');
  return {
    'x-service-timestamp': timestamp,
    'x-service-signature': `sha256=${hex}`,
  };
}
