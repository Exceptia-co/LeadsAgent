#!/usr/bin/env node
/**
 * Staging smoke test: validates PR5a runtime tenant enforcement against
 * a local whatsapp-service instance. Hits public endpoints (health) +
 * HMAC-signed endpoints with various tenant claims to verify:
 *
 *  - signed request without tenant header        -> 403 (PR5a-bis)
 *  - signed request with invalid UUID tenant     -> 403 (PR5a-bis)
 *  - signed request with valid tenant            -> 200 / scoped data
 *  - cross-tenant sessionId lookup               -> 404 (PR5a-ter)
 *  - operator-only endpoint (env unset)          -> 403 (PR5a-quinquies)
 *
 * Usage:
 *   pnpm tsx scripts/staging-smoke.mjs
 *
 * Reads WHATSAPP_SERVICE_HMAC_SECRET from .env automatically.
 */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Minimal .env loader (no dependency).
function loadDotEnv() {
  try {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    const text = readFileSync(join(root, ".env"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
      if (!m) continue;
      const [, k, vRaw] = m;
      if (process.env[k] !== undefined) continue;
      const v = vRaw.replace(/^["']|["']$/g, "");
      process.env[k] = v;
    }
  } catch (e) {
    console.warn(`[smoke] could not read .env: ${e.message}`);
  }
}
loadDotEnv();

const URL_BASE = process.env.WHATSAPP_SERVICE_URL ?? "http://localhost:3002";
const SECRET = process.env.WHATSAPP_SERVICE_HMAC_SECRET;
const TENANT_VALID = process.env.TENANT_ID_VALID ?? "fc732fd0-095b-4be7-b1ee-eb9b0b37580c";
const TENANT_OTHER = "11111111-1111-4111-8111-111111111111";

if (!SECRET) {
  console.error("WHATSAPP_SERVICE_HMAC_SECRET is required");
  process.exit(1);
}

function sign(body, tenantId = "") {
  const ts = Date.now().toString();
  const payload = `${ts}.${tenantId}.${body}`;
  const hex = createHmac("sha256", SECRET).update(payload).digest("hex");
  return {
    "x-service-timestamp": ts,
    "x-service-tenant-id": tenantId,
    "x-service-signature": `sha256=${hex}`,
  };
}

let pass = 0;
let fail = 0;

async function check(name, expectedStatus, fn) {
  try {
    const res = await fn();
    const got = res.status;
    const ok = Array.isArray(expectedStatus)
      ? expectedStatus.includes(got)
      : got === expectedStatus;
    if (ok) {
      console.log(`  PASS  ${name}  -> ${got}`);
      pass++;
    } else {
      const body = await res.text();
      console.log(
        `  FAIL  ${name}  expected=${JSON.stringify(expectedStatus)} got=${got} body=${body.slice(0, 200)}`
      );
      fail++;
    }
  } catch (e) {
    console.log(`  FAIL  ${name}  threw=${e.message}`);
    fail++;
  }
}

console.log("\n=== PR5a runtime smoke ===\n");

console.log("[A] Public health (no auth required)");
await check("GET /api/health", 200, () =>
  fetch(`${URL_BASE}/api/health`)
);

console.log("\n[B] HMAC missing -> 401");
await check("GET /api/sessions (no headers)", 401, () =>
  fetch(`${URL_BASE}/api/sessions`)
);

console.log("\n[C] HMAC valid + tenant empty -> 403 (tenant context required)");
await check("GET /api/sessions (empty tenant)", 403, () =>
  fetch(`${URL_BASE}/api/sessions`, {
    headers: sign("", ""),
  })
);

console.log("\n[D] HMAC valid + tenant invalid UUID -> 403");
await check("GET /api/sessions (invalid uuid tenant)", 403, () =>
  fetch(`${URL_BASE}/api/sessions`, {
    headers: sign("", "not-a-uuid"),
  })
);

console.log("\n[E] HMAC valid + tenant=valid -> 200 scoped");
await check("GET /api/sessions (valid tenant)", 200, () =>
  fetch(`${URL_BASE}/api/sessions`, {
    headers: sign("", TENANT_VALID),
  })
);

console.log("\n[F] HMAC body tampering -> 401 (signature mismatch)");
await check("POST /api/sessions tampered body", 401, () => {
  const headers = sign(JSON.stringify({ sessionId: "x" }), TENANT_VALID);
  return fetch(`${URL_BASE}/api/sessions`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: "swapped-after-sign" }),
  });
});

console.log("\n[G] Cross-tenant session ownership -> 404");
// Tenant 'TENANT_OTHER' tries to GET session 'tester' which belongs to TENANT_VALID.
await check("GET /api/sessions/tester (cross tenant)", 404, () =>
  fetch(`${URL_BASE}/api/sessions/tester`, {
    headers: sign("", TENANT_OTHER),
  })
);

console.log("\n[H] Cross-tenant backup attempt -> 404");
await check("POST /api/sessions/tester/backup (cross tenant)", 404, () =>
  fetch(`${URL_BASE}/api/sessions/tester/backup`, {
    method: "POST",
    headers: { ...sign("", TENANT_OTHER), "Content-Type": "application/json" },
    body: "",
  })
);

console.log("\n[I] Operator-only /ai/switch -> 403 (env unset)");
await check("POST /ai/switch (no operator)", 403, () => {
  const body = JSON.stringify({ provider: "openrouter" });
  return fetch(`${URL_BASE}/api/ai/switch`, {
    method: "POST",
    headers: { ...sign(body, TENANT_VALID), "Content-Type": "application/json" },
    body,
  });
});

console.log("\n[J] Operator-only PUT /system/variables -> 403 (env unset)");
await check("PUT /system/variables (no operator)", 403, () => {
  const body = JSON.stringify({ empresa: "X" });
  return fetch(`${URL_BASE}/api/system/variables`, {
    method: "PUT",
    headers: { ...sign(body, TENANT_VALID), "Content-Type": "application/json" },
    body,
  });
});

console.log("\n[K] Tenant-readable GET /system/variables -> 200");
await check("GET /system/variables", 200, () =>
  fetch(`${URL_BASE}/api/system/variables`, {
    headers: sign("", TENANT_VALID),
  })
);

console.log("\n[L] /sessions/stats tenant-scoped -> 200");
await check("GET /sessions/stats (valid tenant)", 200, () =>
  fetch(`${URL_BASE}/api/sessions/stats`, {
    headers: sign("", TENANT_VALID),
  })
);

console.log(`\n=== Summary: ${pass} pass, ${fail} fail ===`);
process.exit(fail === 0 ? 0 : 1);
