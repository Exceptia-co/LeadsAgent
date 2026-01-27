import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  getUserStats,
  UnifiedAuthError,
} from "../../../../lib/auth/unified-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    // Verificar autenticación
    const user = await requireAuth();

    // Obtener estadísticas del usuario
    const stats = await getUserStats(user.clerkId);

    if (!stats) {
      return NextResponse.json(
        { error: "Failed to get user statistics" },
        { status: 500 },
      );
    }

    return NextResponse.json(stats);
  } catch (error) {
    console.error("Error in /api/users/stats:", error);

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
