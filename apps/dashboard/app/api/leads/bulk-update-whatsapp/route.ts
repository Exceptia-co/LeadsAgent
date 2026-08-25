import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { requireClerkToken } from "../../../../lib/auth/proxy-auth";
import { resolveActiveTenantId } from "../../../../lib/auth/tenant-lookup";

// Force dynamic rendering for this route
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Lazy initialization to avoid build-time errors
let supabaseInstance: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!supabaseInstance) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error("Missing Supabase environment variables");
    }

    supabaseInstance = createClient(url, key);
  }
  return supabaseInstance;
}

interface BulkUpdateRequest {
  leadIds: string[];
  whatsappAuthorized: boolean;
}

export async function PATCH(request: NextRequest) {
  const gate = await requireClerkToken();
  if (gate instanceof NextResponse) return gate;

  // requireClerkToken only proves *a* valid Clerk session; it says nothing
  // about which org. This route uses the service-role key, which bypasses
  // RLS, so every query below must carry the tenant filter itself.
  const tenantId = await resolveActiveTenantId();
  if (!tenantId) {
    return NextResponse.json({ error: "No active organization" }, { status: 403 });
  }

  try {
    const body: BulkUpdateRequest = await request.json();

    if (!body.leadIds || !Array.isArray(body.leadIds) || body.leadIds.length === 0) {
      return NextResponse.json(
        { error: "leadIds array is required and cannot be empty" },
        { status: 400 },
      );
    }

    if (body.leadIds.length > 100) {
      return NextResponse.json(
        { error: "Cannot update more than 100 leads at once" },
        { status: 400 },
      );
    }

    if (typeof body.whatsappAuthorized !== "boolean") {
      return NextResponse.json({ error: "whatsappAuthorized must be a boolean" }, { status: 400 });
    }

    const validIds = body.leadIds.filter((id) => typeof id === "string" && id.trim() !== "");
    if (validIds.length !== body.leadIds.length) {
      return NextResponse.json(
        { error: "All lead IDs must be valid non-empty strings" },
        { status: 400 },
      );
    }

    const { data: updateResult, error: updateError } = await getSupabase()
      .from("leads")
      .update({
        whatsapp_authorized: body.whatsappAuthorized,
        updated_at: new Date().toISOString(),
      })
      .in("id", validIds)
      .eq("tenant_id", tenantId)
      .select("id");

    if (updateError) {
      console.error("Error updating leads:", updateError);
      throw new Error(`Database update failed: ${updateError.message}`);
    }

    const updatedCount = updateResult?.length || 0;

    if (updatedCount === 0) {
      return NextResponse.json(
        {
          error: "No leads were found with the provided IDs",
          updatedCount: 0,
          requestedCount: validIds.length,
        },
        { status: 404 },
      );
    }

    const { data: updatedLeads, error: readbackError } = await getSupabase()
      .from("leads")
      .select("id, name, phone, whatsapp_authorized, updated_at")
      .in("id", validIds)
      .eq("tenant_id", tenantId);

    // The update already succeeded; a failed read-back must not look like
    // "updated 0 leads", so surface it instead of returning an empty list.
    if (readbackError) {
      console.error("Error reading back updated leads:", readbackError);
      throw new Error(`Database read-back failed: ${readbackError.message}`);
    }

    const formattedLeads = (updatedLeads || []).map((lead) => ({
      id: lead.id,
      name: lead.name,
      phone: lead.phone,
      whatsappAuthorized: lead.whatsapp_authorized,
      updatedAt: lead.updated_at,
    }));

    return NextResponse.json({
      message: `${updatedCount} lead${updatedCount !== 1 ? "s" : ""} updated successfully`,
      updatedCount,
      requestedCount: validIds.length,
      leads: formattedLeads,
    });
  } catch (error) {
    console.error("Error in bulk update WhatsApp API:", error);

    if (error instanceof Error && error.message.includes("Missing Supabase")) {
      return NextResponse.json(
        {
          error: "Database configuration error. Please check environment variables.",
        },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { error: "Internal server error while updating leads" },
      { status: 500 },
    );
  }
}
