import React, { useState } from "react";
import { useUnifiedUser } from "../hooks/use-unified-user";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Loader2, Settings, User, Shield, Activity } from "lucide-react";

/**
 * Componente de perfil de usuario que demuestra el uso del sistema unificado
 * Utiliza tanto datos de Clerk como de Supabase de forma seamless
 */
export function UserProfile() {
  const { user, clerkUser, isLoading, error, updateSettings, refreshUser } = useUnifiedUser();
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);

  const handleUpdateNotifications = async () => {
    if (!user) return;

    setIsUpdatingSettings(true);
    try {
      const newSettings = {
        ...user.settings,
        notifications: {
          ...user.settings.notifications,
          whatsapp: !user.settings.notifications?.whatsapp,
        },
      };

      const success = await updateSettings(newSettings);
      if (success) {
        console.log("✅ Settings updated successfully");
      } else {
        console.error("❌ Failed to update settings");
      }
    } catch (error) {
      console.error("Error updating settings:", error);
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          <span>Cargando perfil...</span>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-6 border-red-200 bg-red-50">
        <div className="text-red-800">
          <h3 className="font-semibold">Error de autenticación</h3>
          <p className="text-sm mt-1">{error}</p>
          <button
            onClick={refreshUser}
            className="mt-3 px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            Reintentar
          </button>
        </div>
      </Card>
    );
  }

  if (!user) {
    return (
      <Card className="p-6">
        <div className="text-center">
          <User className="h-8 w-8 mx-auto mb-2 text-gray-400" />
          <p className="text-gray-600">No hay sesión activa</p>
        </div>
      </Card>
    );
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "admin":
        return "destructive";
      case "manager":
        return "secondary";
      default:
        return "default";
    }
  };

  return (
    <div className="space-y-6">
      {/* Información básica del usuario */}
      <Card className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-4">
            {user.profileImageUrl && (
              <img src={user.profileImageUrl} alt="Profile" className="h-12 w-12 rounded-full" />
            )}
            <div>
              <h2 className="text-xl font-semibold">
                {user.firstName || user.lastName
                  ? `${user.firstName || ""} ${user.lastName || ""}`.trim()
                  : "Usuario"}
              </h2>
              <p className="text-gray-600">{user.email}</p>
              <div className="flex items-center space-x-2 mt-1">
                <Badge variant={getRoleBadgeColor(user.role)} className="text-xs">
                  <Shield className="h-3 w-3 mr-1" />
                  {user.role.toUpperCase()}
                </Badge>
                {user.isActive ? (
                  <Badge variant="default" className="text-xs bg-green-100 text-green-800">
                    <Activity className="h-3 w-3 mr-1" />
                    Activo
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs">
                    Inactivo
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={refreshUser}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            Actualizar
          </button>
        </div>

        {/* Información de sesión */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-600">Último acceso:</span>
            <p className="font-medium">
              {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("es-ES") : "Nunca"}
            </p>
          </div>
          <div>
            <span className="text-gray-600">Miembro desde:</span>
            <p className="font-medium">{new Date(user.createdAt).toLocaleDateString("es-ES")}</p>
          </div>
        </div>
      </Card>

      {/* Configuraciones del usuario */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center">
            <Settings className="h-5 w-5 mr-2" />
            Configuraciones
          </h3>
        </div>

        <div className="space-y-4">
          {/* Notificaciones */}
          <div>
            <h4 className="font-medium mb-2">Notificaciones</h4>
            <div className="space-y-2">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={user.settings.notifications?.email || false}
                  className="rounded"
                  disabled
                />
                <span className="text-sm">Email</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={user.settings.notifications?.push || false}
                  className="rounded"
                  disabled
                />
                <span className="text-sm">Push</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={user.settings.notifications?.whatsapp || false}
                  onChange={handleUpdateNotifications}
                  className="rounded"
                  disabled={isUpdatingSettings}
                />
                <span className="text-sm">WhatsApp</span>
                {isUpdatingSettings && <Loader2 className="h-4 w-4 animate-spin" />}
              </label>
            </div>
          </div>

          {/* Preferencias */}
          <div>
            <h4 className="font-medium mb-2">Preferencias</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Idioma:</span>
                <span>{user.settings.preferences?.language || "es"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Zona horaria:</span>
                <span>{user.settings.preferences?.timezone || "Europe/Madrid"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Vista del dashboard:</span>
                <span>{user.settings.preferences?.dashboard_view || "grid"}</span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Información técnica (solo en desarrollo) */}
      {process.env.NODE_ENV === "development" && (
        <Card className="p-6 bg-gray-50">
          <h3 className="text-lg font-semibold mb-4">Información técnica</h3>
          <div className="space-y-2 text-sm font-mono">
            <div>
              <span className="text-gray-600">Clerk ID:</span>
              <p className="break-all">{user.clerkId}</p>
            </div>
            <div>
              <span className="text-gray-600">Supabase ID:</span>
              <p className="break-all">{user.supabaseId}</p>
            </div>
            <div>
              <span className="text-gray-600">Última actualización:</span>
              <p>{new Date(user.updatedAt).toLocaleString("es-ES")}</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

/**
 * Componente wrapper que maneja la autenticación
 */
export function AuthenticatedUserProfile() {
  const { user, isLoading } = useUnifiedUser();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin mr-2" />
        <span>Cargando...</span>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <User className="h-12 w-12 text-gray-400 mb-4" />
        <h2 className="text-xl font-semibold text-gray-700 mb-2">Acceso requerido</h2>
        <p className="text-gray-600 mb-4">Necesitas iniciar sesión para ver esta página</p>
        <button
          onClick={() => (window.location.href = "/sign-in")}
          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
        >
          Iniciar sesión
        </button>
      </div>
    );
  }

  return <UserProfile />;
}
