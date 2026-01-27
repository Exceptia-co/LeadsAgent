import { NextRequest, NextResponse } from "next/server";
import { getWhatsAppServiceUrl } from "../../../../lib/api-config";

// Force dynamic rendering for this route
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Catch-all proxy for WhatsApp service
 * Routes all requests from /api/whatsapp/* to the WhatsApp service
 * This avoids Mixed Content issues by proxying HTTP through HTTPS
 */

async function proxyRequest(
  request: NextRequest,
  path: string[],
  method: string,
) {
  try {
    const pathString = path.join("/");
    const whatsAppUrl = getWhatsAppServiceUrl();

    // Build the target URL
    const targetUrl = new URL(`${whatsAppUrl}/${pathString}`);

    // Forward query parameters
    request.nextUrl.searchParams.forEach((value, key) => {
      targetUrl.searchParams.set(key, value);
    });

    // Prepare fetch options
    const fetchOptions: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
      },
    };

    // Forward body for POST/PUT/PATCH requests
    if (["POST", "PUT", "PATCH"].includes(method)) {
      try {
        const body = await request.text();
        if (body) {
          fetchOptions.body = body;
        }
      } catch {
        // No body to forward
      }
    }

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
