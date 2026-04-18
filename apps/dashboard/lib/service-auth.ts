/**
 * T0.4-ter: dashboard-side helper to sign outbound requests to the
 * whatsapp-service. Keeps the signature format in lock-step with the
 * verifier in `apps/whatsapp-service/src/middleware/auth.ts` and the
 * equivalent helper in `apps/api/src/whatsapp/service-auth.ts`.
 *
 * Format:
 *   payload    = `${timestamp}.${body}`
 *   signature  = `sha256=${hex HMAC-SHA256(payload, secret)}`
 *   headers    = x-service-timestamp, x-service-signature
 */
import { createHmac } from "node:crypto";

export interface SignedHeaders {
  "x-service-timestamp": string;
  "x-service-signature": string;
}

export function signServiceRequest(body: string, secret: string): SignedHeaders {
  const timestamp = Date.now().toString();
  const payload = `${timestamp}.${body}`;
  const hex = createHmac("sha256", secret).update(payload).digest("hex");
  return {
    "x-service-timestamp": timestamp,
    "x-service-signature": `sha256=${hex}`,
  };
}
