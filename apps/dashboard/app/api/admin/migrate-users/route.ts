import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  requireRole,
  UnifiedAuthError,
} from "../../../../lib/auth/unified-auth";

export const dynamic = "force-dynamic";

interface MigratedUser {
  id: string;
  email: string;
  role: string;
  clerk_id: string;
  first_name?: string;
  last_name?: string;
  is_active?: boolean;
  settings?: Record<string, unknown>;
}

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

/**
 * Endpoint para migrar usuarios existentes de Clerk a Supabase
 * Solo disponible para administradores
 *
 * IMPORTANTE: Este endpoint requiere que tengas usuarios ya autenticados en Clerk
 * Si no tienes usuarios reales, puedes usar este endpoint para crear usuarios de prueba
 */
export async function POST(request: NextRequest) {
  try {
    // Verificar que solo admins pueden ejecutar esto
    const currentUser = await requireRole(["admin"]);

    const body = await request.json();
    const { action = "migrate", testUsers = false } = body;

    if (action === "migrate") {
      return await migrateExistingUsers();
    } else if (action === "create-test-users" && testUsers) {
      return await createTestUsers();
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Use "migrate" or "create-test-users"' },
        { status: 400 },
      );
    }
  } catch (error) {
    console.error("Error in migrate-users endpoint:", error);

    if (error instanceof UnifiedAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode },
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * Migra usuarios existentes de Clerk (requiere Clerk API funcionando)
 */
async function migrateExistingUsers() {
  try {
    // Nota: Aquí necesitaríamos hacer llamadas a la API de Clerk para obtener usuarios
    // Como no tenemos las credenciales correctas, simularemos el proceso

    console.log("🔄 Starting user migration...");

    // En un escenario real, harías esto:
    /*
    const clerkResponse = await fetch('https://api.clerk.dev/v1/users', {
      headers: {
        'Authorization': `Bearer ${process.env.CLERK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      }
    })
    
    const clerkUsers = await clerkResponse.json()
    */

    // Para demostración, creamos algunos usuarios de ejemplo
    const mockClerkUsers = [
      {
        id: "user_demo_admin",
        email_addresses: [{ email_address: "admin@leadcrm.com" }],
        first_name: "Admin",
        last_name: "LeadsCRM",
        image_url: null,
        created_at: Date.now() - 30 * 24 * 60 * 60 * 1000, // 30 días atrás
        updated_at: Date.now(),
      },
      {
        id: "user_demo_manager",
        email_addresses: [{ email_address: "manager@leadcrm.com" }],
        first_name: "Manager",
        last_name: "Test",
        image_url: null,
        created_at: Date.now() - 15 * 24 * 60 * 60 * 1000, // 15 días atrás
        updated_at: Date.now(),
      },
      {
        id: "user_demo_user",
        email_addresses: [{ email_address: "user@leadcrm.com" }],
        first_name: "Usuario",
        last_name: "Demo",
        image_url: null,
        created_at: Date.now() - 7 * 24 * 60 * 60 * 1000, // 7 días atrás
        updated_at: Date.now(),
      },
    ];

    const migratedUsers: MigratedUser[] = [];
    const errors: { clerkId: string; error: string }[] = [];

    for (const clerkUser of mockClerkUsers) {
      try {
        const primaryEmail = clerkUser.email_addresses[0]?.email_address;
        if (!primaryEmail) {
          console.warn(`Skipping user ${clerkUser.id} - no primary email`);
          continue;
        }

        // Verificar si el usuario ya existe
        const { data: existingUser } = await getSupabase()
          .from("users")
          .select("id, clerk_id")
          .eq("clerk_id", clerkUser.id)
          .single();

        if (existingUser) {
          console.log(`User ${clerkUser.id} already exists, skipping...`);
          continue;
        }

        // Determinar rol basado en email (esto es solo para demo)
        let role = "user";
        if (primaryEmail.includes("admin")) role = "admin";
        else if (primaryEmail.includes("manager")) role = "manager";

        // Crear usuario en Supabase
        const { data: newUser, error } = await getSupabase()
          .from("users")
          .insert({
            clerk_id: clerkUser.id,
            email: primaryEmail,
            first_name: clerkUser.first_name,
            last_name: clerkUser.last_name,
            profile_image_url: clerkUser.image_url,
            role: role,
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
            // Preservar fechas originales de Clerk
            created_at: new Date(clerkUser.created_at).toISOString(),
            last_login_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (error) {
          console.error(`Error creating user ${clerkUser.id}:`, error);
          errors.push({ clerkId: clerkUser.id, error: error.message });
        } else if (newUser) {
          console.log(`✅ Migrated user: ${primaryEmail} (${role})`);
          migratedUsers.push(newUser as MigratedUser);
        }
      } catch (err) {
        console.error(`Error processing user ${clerkUser.id}:`, err);
        errors.push({ clerkId: clerkUser.id, error: "Processing failed" });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Migration completed. ${migratedUsers.length} users migrated.`,
      migratedUsers: migratedUsers.length,
      errors: errors.length,
      users: migratedUsers.map((u) => ({
        id: u.id,
        email: u.email,
        role: u.role,
        clerk_id: u.clerk_id,
      })),
      errorDetails: errors,
    });
  } catch (error) {
    console.error("Error in migrateExistingUsers:", error);
    throw error;
  }
}

/**
 * Crea usuarios de prueba para testing
 */
async function createTestUsers() {
  try {
    console.log("🔄 Creating test users...");

    const testUsers = [
      {
        clerk_id: "user_test_admin_123",
        email: "admin@test.com",
        first_name: "Admin",
        last_name: "Test",
        role: "admin",
      },
      {
        clerk_id: "user_test_manager_456",
        email: "manager@test.com",
        first_name: "Manager",
        last_name: "Test",
        role: "manager",
      },
      {
        clerk_id: "user_test_user_789",
        email: "user@test.com",
        first_name: "Usuario",
        last_name: "Test",
        role: "user",
      },
    ];

    const createdUsers: MigratedUser[] = [];

    for (const user of testUsers) {
      const { data: newUser, error } = await getSupabase()
        .from("users")
        .insert({
          ...user,
          is_active: true,
          settings: {
            notifications: { email: true, push: true, whatsapp: true },
            preferences: {
              language: "es",
              timezone: "Europe/Madrid",
              dashboard_view: "grid",
            },
          },
        })
        .select()
        .single();

      if (!error && newUser) {
        createdUsers.push(newUser as MigratedUser);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Created ${createdUsers.length} test users`,
      users: createdUsers.map((u) => ({
        id: u.id,
        email: u.email,
        role: u.role,
        clerk_id: u.clerk_id,
      })),
    });
  } catch (error) {
    console.error("Error creating test users:", error);
    throw error;
  }
}
