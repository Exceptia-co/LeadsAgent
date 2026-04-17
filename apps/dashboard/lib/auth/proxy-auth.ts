import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

/**
 * Require a valid Clerk session for server-side proxy routes.
 *
 * Returns the bearer token on success, or a `NextResponse` with 401 that the
 * caller should return immediately. Proxies that forward to the NestJS API
 * can pass the token downstream; proxies that hit the whatsapp-service (which
 * does not accept Clerk tokens yet) can ignore it and just use this as a
 * gate against unauthenticated callers from the public internet.
 *
 * Usage:
 *   const gate = await requireClerkToken();
 *   if (gate instanceof NextResponse) return gate;
 *   const { token } = gate;
 */
export async function requireClerkToken(): Promise<{ token: string } | NextResponse> {
  const { getToken } = await auth();
  const token = await getToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return { token };
}
