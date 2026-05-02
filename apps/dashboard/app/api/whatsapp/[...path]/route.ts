import { NextRequest, NextResponse } from "next/server";
import { getWhatsAppServiceUrl } from "../../../../lib/api-config";
import { requireClerkToken } from "../../../../lib/auth/proxy-auth";
import { resolveActiveTenantId } from "../../../../lib/auth/tenant-lookup";
import { signServiceRequest } from "../../../../lib/service-auth";

// Force dynamic rendering for this route
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Catch-all proxy for WhatsApp service
 * Routes all requests from /api/whatsapp/* to the WhatsApp service
 * This avoids Mixed Content issues by proxying HTTP through HTTPS
 *
 * Gated by Clerk session. The whatsapp-service itself does not (yet) validate
 * the forwarded token — the auth here is the public-internet gate until the
 * service grows its own middleware (see PRD T0.4-ter).
 */

async function proxyRequest(request: NextRequest, path: string[], method: string) {
  const gate = await requireClerkToken();
  if (gate instanceof NextResponse) return gate;

  // PR5a-bis (Codex finding #1): resolve the caller's tenant from the
  // active Clerk org and bind it into the HMAC. Without this, any
  // authenticated user could enumerate sessions/conversations across
  // tenants since the whatsapp-service has no other way to know who is
  // calling. If the user has no active org or the org has no Tenant row
  // yet, return 403 — the dashboard middleware should already have
  // redirected them to /select-org, so this is the server-side last line
  // of defense.
  const tenantId = await resolveActiveTenantId();
  if (!tenantId) {
    return NextResponse.json(
      { error: "No active organization. Select an organization to continue." },
      { status: 403 },
    );
  }

  try {
    const pathString = path.join("/");
    const whatsAppUrl = getWhatsAppServiceUrl();

    // T0.4-ter: the whatsapp-service mounts its router only under /api
    // after dropping the duplicate `/` mount. Incoming proxy paths like
    // `/api/whatsapp/sessions` become `sessions` here and must be forwarded
    // to `${whatsAppUrl}/api/sessions`. If the caller already includes
    // `api/…` (e.g. `/api/whatsapp/api/conversations`), we don't double it.
    const normalisedPath = pathString.startsWith("api/") ? pathString : `api/${pathString}`;
    const targetUrl = new URL(`${whatsAppUrl}/${normalisedPath}`);

    // Forward query parameters
    request.nextUrl.searchParams.forEach((value, key) => {
      targetUrl.searchParams.set(key, value);
    });

    // Read raw body up-front so we can hash it exactly as the downstream
    // verifier will. POST/PUT/PATCH forward it; GET/DELETE sign the empty
    // string — the receiver does the same so the HMAC still matches.
    let bodyString = "";
    if (["POST", "PUT", "PATCH"].includes(method)) {
      try {
        bodyString = await request.text();
      } catch {
        bodyString = "";
      }
    }

    const secret = process.env.WHATSAPP_SERVICE_HMAC_SECRET;
    if (!secret) {
      console.error("[WhatsApp Proxy] WHATSAPP_SERVICE_HMAC_SECRET is not configured");
      return NextResponse.json(
        { error: "Proxy misconfigured: missing service auth secret" },
        { status: 500 },
      );
    }

    const signedHeaders = signServiceRequest(bodyString, secret, tenantId);

    const fetchOptions: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
        ...signedHeaders,
      },
      ...(bodyString ? { body: bodyString } : {}),
    };

    console.log(`[WhatsApp Proxy] ${method} ${targetUrl.toString()}`);

    const response = await fetch(targetUrl.toString(), fetchOptions);

    // Handle non-JSON responses (like health check text)
    const contentType = response.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      const data = await response.json();
      return NextResponse.json(data, { status: response.status });
    } else {
      const text = await response.text();
      return new NextResponse(text, {
        status: response.status,
        headers: { "Content-Type": contentType || "text/plain" },
      });
    }
  } catch (error) {
    console.error(`[WhatsApp Proxy] Error:`, error);
    return NextResponse.json(
      {
        error: "Failed to connect to WhatsApp service",
        details: String(error),
      },
      { status: 502 },
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return proxyRequest(request, path, "GET");
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return proxyRequest(request, path, "POST");
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return proxyRequest(request, path, "PUT");
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return proxyRequest(request, path, "DELETE");
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return proxyRequest(request, path, "PATCH");
}
