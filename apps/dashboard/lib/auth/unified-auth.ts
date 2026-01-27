import { auth } from "@clerk/nextjs/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

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

export interface UnifiedUser {
  // Datos de Clerk
  clerkId: string;
  clerkUser?: unknown;

  // Datos de Supabase
  supabaseId: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  profileImageUrl?: string | null;
  role: string;
  isActive: boolean;
  settings: Record<string, any>;
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export class UnifiedAuthError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 401,
  ) {
    super(message);
    this.name = "UnifiedAuthError";
  }
}

/**
 * Obtiene el usuario unificado (Clerk + Supabase)
 * Valida la sesión de Clerk y obtiene datos complementarios de Supabase
 */
export async function getUnifiedUser(): Promise<UnifiedUser | null> {
  try {
    // 1. Verificar autenticación con Clerk
    const { userId } = await auth();

    if (!userId) {
      return null;
    }

    // 2. Buscar usuario en Supabase por clerk_id
    const { data: supabaseUser, error } = await getSupabase()
      .from("users")
      .select("*")
      .eq("clerk_id", userId)
      .eq("is_active", true)
      .single();

    if (error) {
      console.error("Error fetching user from Supabase:", error);

      // Si el usuario no existe en Supabase, intentar crearlo
      if (error.code === "PGRST116") {
        // No rows returned
        console.log("User not found in Supabase, attempting to create...");
        const createdUser = await createUserFromClerk(userId);
        if (createdUser) {
          return createdUser;
        }
      }

      throw new UnifiedAuthError(
        "User not found or inactive in database",
        "USER_NOT_FOUND_DB",
        404,
      );
    }

    // 3. Actualizar last_login_at
    await getSupabase()
      .from("users")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", supabaseUser.id);

    // 4. Construir usuario unificado
    const unifiedUser: UnifiedUser = {
      clerkId: userId,
      supabaseId: supabaseUser.id,
      email: supabaseUser.email,
      firstName: supabaseUser.first_name,
      lastName: supabaseUser.last_name,
      profileImageUrl: supabaseUser.profile_image_url,
      role: supabaseUser.role,
      isActive: supabaseUser.is_active,
      settings: supabaseUser.settings || {},
      lastLoginAt: supabaseUser.last_login_at,
      createdAt: supabaseUser.created_at,
      updatedAt: supabaseUser.updated_at,
    };

    return unifiedUser;
  } catch (error) {
    console.error("Error in getUnifiedUser:", error);
    if (error instanceof UnifiedAuthError) {
      throw error;
    }
    throw new UnifiedAuthError("Authentication failed", "AUTH_FAILED", 500);
  }
}

/**
 * Crea un usuario en Supabase basado en los datos de Clerk
 * Esto es útil cuando un usuario se autentica por primera vez
 */
async function createUserFromClerk(
  clerkId: string,
): Promise<UnifiedUser | null> {
  try {
    // Nota: En un escenario real, aquí harías una llamada a la API de Clerk
    // para obtener los datos del usuario. Por ahora, creamos un usuario básico
    console.log("Creating user from Clerk ID:", clerkId);

    const { data: newUser, error } = await getSupabase()
      .from("users")
      .insert({
        clerk_id: clerkId,
        email: `user-${clerkId}@temp.com`, // Email temporal
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
      return null;
    }

    console.log("✅ User created in Supabase:", newUser);

    return {
      clerkId,
      supabaseId: newUser.id,
      email: newUser.email,
      firstName: newUser.first_name,
      lastName: newUser.last_name,
      profileImageUrl: newUser.profile_image_url,
      role: newUser.role,
      isActive: newUser.is_active,
      settings: newUser.settings || {},
      lastLoginAt: newUser.last_login_at,
      createdAt: newUser.created_at,
      updatedAt: newUser.updated_at,
    };
  } catch (error) {
    console.error("Error creating user from Clerk:", error);
    return null;
  }
}

/**
 * Middleware para proteger rutas que requieren autenticación
 * Úsalo en API routes o server components
 */
export async function requireAuth(): Promise<UnifiedUser> {
  const user = await getUnifiedUser();

  if (!user) {
    throw new UnifiedAuthError("Authentication required", "AUTH_REQUIRED", 401);
  }

  return user;
}

/**
 * Middleware para verificar permisos de rol
 */
export async function requireRole(
  allowedRoles: string[],
): Promise<UnifiedUser> {
  const user = await requireAuth();

  if (!allowedRoles.includes(user.role)) {
    throw new UnifiedAuthError(
      "Insufficient permissions",
      "INSUFFICIENT_PERMISSIONS",
      403,
    );
  }

  return user;
}

/**
 * Actualiza la configuración del usuario en Supabase
 */
export async function updateUserSettings(
  userId: string,
  settings: Record<string, any>,
): Promise<boolean> {
  try {
    const { error } = await getSupabase()
      .from("users")
      .update({
        settings: settings,
        updated_at: new Date().toISOString(),
      })
      .eq("clerk_id", userId);

    if (error) {
      console.error("Error updating user settings:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error updating user settings:", error);
    return false;
  }
}

/**
 * Obtiene estadísticas del usuario para el dashboard
 */
export async function getUserStats(userId: string) {
  try {
    // Obtener datos del usuario
    const { data: user } = await getSupabase()
      .from("users")
      .select("id")
      .eq("clerk_id", userId)
      .single();

    if (!user) return null;

    // Obtener estadísticas de leads asignados al usuario
    const { count: totalLeads } = await getSupabase()
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("assigned_to", user.id);

    const { count: activeLeads } = await getSupabase()
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("assigned_to", user.id)
      .neq("status", "CERRADO");

    const total = totalLeads ?? 0;
    const active = activeLeads ?? 0;
    return {
      totalLeads: total,
      activeLeads: active,
      completionRate: total > 0 ? ((total - active) / total) * 100 : 0,
    };
  } catch (error) {
    console.error("Error getting user stats:", error);
    return null;
  }
}
