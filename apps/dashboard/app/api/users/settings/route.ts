import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  updateUserSettings,
  UnifiedAuthError,
} from "../../../../lib/auth/unified-auth";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  try {
    // Verificar autenticación
    const user = await requireAuth();

    // Obtener configuraciones del body
    const body = await request.json();
    const { settings } = body;

    if (!settings || typeof settings !== "object") {
      return NextResponse.json({ error: "Invalid settings data" }, { status: 400 });
    }

    // Actualizar configuraciones
    const success = await updateUserSettings(user.clerkId, settings);

    if (!success) {
      return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "Settings updated successfully",
    });
  } catch (error) {
    console.error("Error in /api/users/settings:", error);

    if (error instanceof UnifiedAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode },
      );
    }

    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
