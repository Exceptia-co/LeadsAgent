/**
 * T0.4-ter (PR5a-bis update): dashboard-side helper to sign outbound
 * requests to the whatsapp-service. Keeps the signature format in
 * lock-step with `apps/whatsapp-service/src/middleware/auth.ts` and
 * `apps/api/src/whatsapp/service-auth.ts`.
 *
 * Format (PR5a-bis):
 *   payload    = `${timestamp}.${tenantId}.${body}`
 *   signature  = `sha256=${hex HMAC-SHA256(payload, secret)}`
 *   headers    = x-service-timestamp, x-service-tenant-id, x-service-signature
 *
 * `tenantId` is bound INTO the HMAC so a MITM can't swap the
 * x-service-tenant-id header without invalidating the signature. For paths
 * that have no tenant context (e.g. /health) we sign an empty tenantId and
 * the verifier accepts that on its allow-list of public paths.
 */
import { createHmac } from "node:crypto";

export interface SignedHeaders {
  "x-service-timestamp": string;
  "x-service-tenant-id": string;
  "x-service-signature": string;
}

export function signServiceRequest(
  body: string,
  secret: string,
  tenantId: string = "",
): SignedHeaders {
  const timestamp = Date.now().toString();
  const payload = `${timestamp}.${tenantId}.${body}`;
  const hex = createHmac("sha256", secret).update(payload).digest("hex");
  return {
    "x-service-timestamp": timestamp,
    "x-service-tenant-id": tenantId,
    "x-service-signature": `sha256=${hex}`,
  };
}
