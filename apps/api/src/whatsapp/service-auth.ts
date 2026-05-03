/**
 * T0.4-ter (PR5a-bis update): API Nest helper to sign outbound requests
 * to the whatsapp-service. Mirrors `apps/dashboard/lib/service-auth.ts`
 * and the verifier at `apps/whatsapp-service/src/middleware/auth.ts`.
 *
 * Format (PR5a-bis):
 *   payload    = `${timestamp}.${tenantId}.${body}`
 *   headers    = x-service-timestamp, x-service-tenant-id, x-service-signature
 */
import { createHmac } from 'node:crypto';

export interface SignedHeaders {
  'x-service-timestamp': string;
  'x-service-tenant-id': string;
  'x-service-signature': string;
}

export function signServiceRequest(
  body: string,
  secret: string,
  tenantId: string = '',
): SignedHeaders {
  const timestamp = Date.now().toString();
  const payload = `${timestamp}.${tenantId}.${body}`;
  const hex = createHmac('sha256', secret).update(payload).digest('hex');
  return {
    'x-service-timestamp': timestamp,
    'x-service-tenant-id': tenantId,
    'x-service-signature': `sha256=${hex}`,
  };
}
