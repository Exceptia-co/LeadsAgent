import { NextRequest, NextResponse } from "next/server";
import { getApiUrl } from "../../../../../lib/api-config";
import { requireClerkToken } from "../../../../../lib/auth/proxy-auth";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireClerkToken();
  if (gate instanceof NextResponse) return gate;

  try {
    const { id } = params;
    const body = await request.json();

    const response = await fetch(`${getApiUrl()}/leads/${id}/whatsapp`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${gate.token}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Error updating lead WhatsApp authorization in backend" },
        { status: response.status },
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error in lead whatsapp PATCH API:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
