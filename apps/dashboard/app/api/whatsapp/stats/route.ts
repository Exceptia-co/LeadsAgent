import { NextRequest, NextResponse } from "next/server";
import { getWhatsAppServiceUrl } from "../../../../lib/api-config";

// Force dynamic rendering for this route
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Construir la URL del backend con los parámetros de búsqueda
    const backendUrl = new URL(`${getWhatsAppServiceUrl()}/api/stats`);
    searchParams.forEach((value, key) => {
      backendUrl.searchParams.set(key, value);
    });

    const response = await fetch(backendUrl.toString());

    if (!response.ok) {
      return NextResponse.json(
        { error: "Error fetching stats from backend" },
        { status: response.status },
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error in stats API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
