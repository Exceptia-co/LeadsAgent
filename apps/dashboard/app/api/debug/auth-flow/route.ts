import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
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

interface DebugStep {
  step: number | string;
  action?: string;
  description?: string;
  data?: Record<string, unknown>;
  error?: unknown;
  result?: string;
  query?: string;
  wouldHappen?: string;
  user?: Record<string, unknown>;
}

/**
 * Endpoint de debugging para mostrar exactamente cómo funciona el flujo de autenticación
 * Muestra información paso a paso de Clerk → Supabase
 */
export async function GET(request: NextRequest) {
  const debugInfo: {
    timestamp: string;
    steps: DebugStep[];
    finalResult: Record<string, unknown> | null;
    error: string | null;
  } = {
    timestamp: new Date().toISOString(),
    steps: [],
    finalResult: null,
    error: null,
  };

  try {
    // Paso 1: Verificar sesión de Clerk
    debugInfo.steps.push({
      step: 1,
      action: "Checking Clerk session",
      description: "Usando auth() de Clerk para verificar JWT",
    });

    const { userId, sessionId } = await auth();

    debugInfo.steps.push({
      step: 2,
      action: "Clerk session result",
      data: {
        userId: userId || "null",
        sessionId: sessionId || "null",
        isAuthenticated: !!userId,
      },
    });

    if (!userId) {
      debugInfo.finalResult = {
        authenticated: false,
        reason: "No Clerk session found",
        recommendation: "User needs to sign in through Clerk",
      };

      return NextResponse.json(debugInfo);
    }

    // Paso 3: Buscar usuario en Supabase
    debugInfo.steps.push({
      step: 3,
      action: "Searching user in Supabase",
      description: `Looking for user with clerk_id = "${userId}"`,
    });

    const { data: supabaseUser, error: supabaseError } = await getSupabase()
      .from("users")
      .select("*")
      .eq("clerk_id", userId)
      .single();

    if (supabaseError) {
      debugInfo.steps.push({
        step: 4,
        action: "Supabase query error",
        error: {
          code: supabaseError.code,
          message: supabaseError.message,
          details: supabaseError.details,
        },
      });

      if (supabaseError.code === "PGRST116") {
        // Usuario no encontrado en Supabase
        debugInfo.finalResult = {
          authenticated: true,
          clerkUserId: userId,
          supabaseUser: null,
          status: "clerk_only",
          reason: "User exists in Clerk but not in Supabase",
          recommendation: "User would be auto-created on first app access, or run migration",
        };
      } else {
        debugInfo.error = "Database error occurred";
      }
    } else {
      // Usuario encontrado en Supabase
      debugInfo.steps.push({
        step: 4,
        action: "User found in Supabase",
        data: {
          supabase_id: supabaseUser.id,
          email: supabaseUser.email,
          role: supabaseUser.role,
          is_active: supabaseUser.is_active,
        },
      });

      debugInfo.finalResult = {
        authenticated: true,
        status: "fully_synced",
        unifiedUser: {
          clerkId: userId,
          supabaseId: supabaseUser.id,
          email: supabaseUser.email,
          firstName: supabaseUser.first_name,
          lastName: supabaseUser.last_name,
          role: supabaseUser.role,
          isActive: supabaseUser.is_active,
          settings: supabaseUser.settings,
          createdAt: supabaseUser.created_at,
          updatedAt: supabaseUser.updated_at,
        },
        dataSource: "Clerk (session) + Supabase (extended data)",
      };

      // Paso 5: Opcional - Actualizar último login
      debugInfo.steps.push({
        step: 5,
        action: "Update last login timestamp",
        description: "Updating last_login_at in Supabase",
      });

      await getSupabase()
        .from("users")
        .update({ last_login_at: new Date().toISOString() })
        .eq("id", supabaseUser.id);
    }

    // Información adicional sobre usuarios disponibles
    const { data: allUsers, count } = await getSupabase()
      .from("users")
      .select("clerk_id, email, role", { count: "exact" });

    debugInfo.steps.push({
      step: 6,
      action: "Available users in Supabase",
      data: {
        total_users: count,
        users:
          allUsers?.map((u) => ({
            clerk_id: u.clerk_id,
            email: u.email,
            role: u.role,
          })) || [],
      },
    });

    return NextResponse.json(debugInfo);
  } catch (error) {
    debugInfo.error = error instanceof Error ? error.message : "Unknown error";
    debugInfo.steps.push({
      step: "ERROR",
      action: "Exception caught",
      error: debugInfo.error,
    });

    return NextResponse.json(debugInfo, { status: 500 });
  }
}

/**
 * Endpoint para simular diferentes escenarios de autenticación
 */
export async function POST(request: NextRequest) {
  try {
    const { simulate } = await request.json();

    switch (simulate) {
      case "user_demo_admin":
        return simulateUser("user_demo_admin");
      case "user_demo_manager":
        return simulateUser("user_demo_manager");
      case "user_demo_user":
        return simulateUser("user_demo_user");
      case "nonexistent_user":
        return simulateUser("user_does_not_exist");
      default:
        return NextResponse.json(
          {
            error: "Invalid simulation type",
            available: [
              "user_demo_admin",
              "user_demo_manager",
              "user_demo_user",
              "nonexistent_user",
            ],
          },
          { status: 400 },
        );
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: "Invalid request body",
      },
      { status: 400 },
    );
  }
}

async function simulateUser(clerkId: string) {
  const simulation: {
    simulated_clerk_id: string;
    timestamp: string;
    steps: DebugStep[];
  } = {
    simulated_clerk_id: clerkId,
    timestamp: new Date().toISOString(),
    steps: [],
  };

  // Simular búsqueda en Supabase
  simulation.steps.push({
    step: 1,
    action: "Simulating Supabase lookup",
    query: `SELECT * FROM users WHERE clerk_id = '${clerkId}'`,
  });

  const { data: user, error } = await getSupabase()
    .from("users")
    .select("*")
    .eq("clerk_id", clerkId)
    .single();

  if (error) {
    simulation.steps.push({
      step: 2,
      result: "User not found",
      error: error.message,
      wouldHappen: "App would attempt to auto-create user or show error",
    });

    return NextResponse.json({
      ...simulation,
      found: false,
      user: null,
    });
  }

  simulation.steps.push({
    step: 2,
    result: "User found",
    user: {
      supabase_id: user.id,
      email: user.email,
      role: user.role,
      settings: user.settings,
    },
  });

  return NextResponse.json({
    ...simulation,
    found: true,
    user: user,
    unifiedUser: {
      clerkId: clerkId,
      supabaseId: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
      isActive: user.is_active,
      settings: user.settings,
    },
  });
}
