import { headers } from "next/headers";
import { Webhook } from "svix";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

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

// Definir los tipos de eventos de Clerk que manejamos
type ClerkWebhookEvent = {
  type: string;
  data: {
    id: string;
    email_addresses: Array<{
      email_address: string;
      id: string;
    }>;
    first_name: string | null;
    last_name: string | null;
    image_url: string | null;
    created_at: number;
    updated_at: number;
  };
};

export async function POST(req: Request) {
  // Obtener los headers de Clerk
  const headerPayload = headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  // Si no hay headers de webhook, retornar error
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response("Error occurred -- no svix headers", {
      status: 400,
    });
  }

  // Obtener el body
  const payload = await req.text();
  const body = JSON.parse(payload);

  // Crear una nueva instancia de Svix con el secret
  const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET || "");

  let evt: ClerkWebhookEvent;

  // Verificar el webhook
  try {
    evt = wh.verify(payload, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as ClerkWebhookEvent;
  } catch (err) {
    console.error("Error verifying webhook:", err);
    return new Response("Error occurred", {
      status: 400,
    });
  }

  // Procesar el evento
  const { type, data } = evt;

  try {
    let debug: unknown = { type };
    switch (type) {
      case "user.created":
        debug = await handleUserCreated(data);
        break;
      case "user.updated":
        debug = await handleUserUpdated(data);
        break;
      case "user.deleted":
        debug = await handleUserDeleted(data);
        break;
      default:
        console.log(`Unhandled webhook event type: ${type}`);
    }

    return new Response(JSON.stringify({ ok: true, type, debug }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    console.error(`Error processing webhook event ${type}:`, error);
    return new Response(
      JSON.stringify({ ok: false, type, error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
}

async function handleUserCreated(data: ClerkWebhookEvent["data"]) {
  console.log("🔄 Creating user in Supabase:", {
    clerkId: data.id,
    email: data.email_addresses[0]?.email_address,
    emailAddressesCount: data.email_addresses?.length ?? 0,
  });

  const primaryEmail = data.email_addresses[0]?.email_address;
  if (!primaryEmail) {
    console.error("No primary email found for user:", data.id);
    return {
      step: "no_primary_email",
      clerkId: data.id,
      emailAddressesShape: Array.isArray(data.email_addresses)
        ? { length: data.email_addresses.length, first: data.email_addresses[0] ?? null }
        : "not_array",
    };
  }

  const { data: user, error } = await getSupabase()
    .from("users")
    .insert({
      clerk_id: data.id,
      email: primaryEmail,
      first_name: data.first_name,
      last_name: data.last_name,
      profile_image_url: data.image_url,
      role: "user",
      is_active: true,
      settings: {
        notifications: {
          email: true,
          push: true,
          whatsapp: true,
        },
        preferences: {
          language: "es",
          timezone: "Europe/Madrid",
          dashboard_view: "grid",
        },
      },
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating user in Supabase:", error);
    return {
      step: "insert_error",
      clerkId: data.id,
      email: primaryEmail,
      error: { code: error.code, message: error.message, details: error.details, hint: error.hint },
    };
  }

  console.log("✅ User created in Supabase:", user);
  return { step: "inserted", clerkId: data.id, email: primaryEmail, id: user?.id ?? null };
}

async function handleUserUpdated(data: ClerkWebhookEvent["data"]) {
  console.log("🔄 Updating user in Supabase:", { clerkId: data.id });

  const primaryEmail = data.email_addresses[0]?.email_address;
  if (!primaryEmail) {
    console.error("No primary email found for user:", data.id);
    return;
  }

  const { data: user, error } = await getSupabase()
    .from("users")
    .update({
      email: primaryEmail,
      first_name: data.first_name,
      last_name: data.last_name,
      profile_image_url: data.image_url,
      updated_at: new Date().toISOString(),
    })
    .eq("clerk_id", data.id)
    .select()
    .single();

  if (error) {
    console.error("Error updating user in Supabase:", error);
    throw error;
  }

  console.log("✅ User updated in Supabase:", user);
}

async function handleUserDeleted(data: ClerkWebhookEvent["data"]) {
  console.log("🔄 Deactivating user in Supabase:", { clerkId: data.id });

  // En lugar de eliminar el usuario, lo desactivamos para mantener la integridad referencial
  const { data: user, error } = await getSupabase()
    .from("users")
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("clerk_id", data.id)
    .select()
    .single();

  if (error) {
    console.error("Error deactivating user in Supabase:", error);
    throw error;
  }

  console.log("✅ User deactivated in Supabase:", user);
}
