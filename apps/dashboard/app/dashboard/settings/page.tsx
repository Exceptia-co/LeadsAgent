"use client";

import { useState } from "react";
import { Card } from "../../../components/ui/card";
import { Badge } from "../../../components/ui/badge";
import { Toggle } from "../../../components/ui/toggle";
import { Alert, AlertTitle, AlertDescription } from "../../../components/ui/alert";
import { useSettings } from "../../../hooks/use-settings";
import { useUser } from "@clerk/nextjs";
import {
  Settings as SettingsIcon,
  Key,
  Smartphone,
  Database,
  Bell,
  Plug,
  Monitor,
  Download,
  Save,
  TestTube,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  HardDrive,
  Cpu,
  MemoryStick,
  User,
  Globe,
  Palette,
  Calendar,
  Bug,
  TrendingUp,
} from "lucide-react";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<
    "general" | "api-keys" | "whatsapp" | "database" | "notifications" | "mcp" | "system" | "backup"
  >("general");
  const { user } = useUser();

  const {
    systemServices,
    databaseStatus,
    systemMetrics,
    apiKeys,
    whatsappSettings,
    notifications,
    mcpServers,
    backupSettings,
    generalSettings,
    isLoading,
    error,
    saving,
    saveSettings,
    createBackup,
    testConnection,
    fetchSystemStatus,
  } = useSettings();

  // Format utilities
  const formatFileSize = (bytes: number) => {
    const sizes = ["B", "KB", "MB", "GB"];
    if (bytes === 0) return "0 B";
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + " " + sizes[i];
  };

  const formatUptime = (ms: number) => {
    const days = Math.floor(ms / (24 * 60 * 60 * 1000));
    const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
    return `${days}d ${hours}h ${minutes}m`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "online":
      case "connected":
        return "text-green-600 bg-green-100";
      case "offline":
      case "disconnected":
        return "text-red-600 bg-red-100";
      case "error":
        return "text-yellow-600 bg-yellow-100";
      default:
        return "text-gray-600 bg-gray-100";
    }
  };

  const maskApiKey = (key: string) => {
    if (!key || key.length <= 8) return key;
    return key.substring(0, 8) + "..." + key.substring(key.length - 4);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
        <div className="animate-pulse">
          <div className="h-64 bg-gray-200 rounded-lg"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
          <p className="text-gray-500">Administra la configuración del sistema y servicios</p>
        </div>
        <div className="flex items-center space-x-2">
          {error && (
            <Alert variant="destructive" className="py-2 px-3">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-sm">{error}</AlertDescription>
            </Alert>
          )}
          <button
            onClick={fetchSystemStatus}
            className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
            title="Actualizar estado"
          >
            <RefreshCw className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8 overflow-x-auto">
          {[
            { id: "general", label: "General", icon: SettingsIcon },
            { id: "api-keys", label: "API Keys", icon: Key },
            { id: "whatsapp", label: "WhatsApp", icon: Smartphone },
            { id: "database", label: "Base de Datos", icon: Database },
            { id: "notifications", label: "Notificaciones", icon: Bell },
            { id: "mcp", label: "Servidores MCP", icon: Plug },
            { id: "system", label: "Sistema", icon: Monitor },
            { id: "backup", label: "Respaldos", icon: Download },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as any)}
              className={`flex items-center py-2 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                activeTab === id
                  ? "border-green-500 text-green-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <Icon className="h-4 w-4 mr-2" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === "general" && (
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              <User className="inline h-5 w-5 mr-2" />
              Información de Usuario
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                <div className="text-sm text-gray-900">{user?.fullName || "Usuario"}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <div className="text-sm text-gray-900">{user?.emailAddresses[0]?.emailAddress}</div>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              <Palette className="inline h-5 w-5 mr-2" />
              Preferencias de Interfaz
            </h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-900">Tema</label>
                  <p className="text-xs text-gray-500">Apariencia de la aplicación</p>
                </div>
                <select
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  value={generalSettings.theme}
                  onChange={(e) =>
                    saveSettings("general", {
                      ...generalSettings,
                      theme: e.target.value,
                    })
                  }
                >
                  <option value="light">Claro</option>
                  <option value="dark">Oscuro</option>
                  <option value="auto">Automático</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-900">Idioma</label>
                  <p className="text-xs text-gray-500">Idioma de la interfaz</p>
                </div>
                <select
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  value={generalSettings.language}
                  onChange={(e) =>
                    saveSettings("general", {
                      ...generalSettings,
                      language: e.target.value,
                    })
                  }
                >
                  <option value="es">Español</option>
                  <option value="en">English</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-900">Zona Horaria</label>
                  <p className="text-xs text-gray-500">Formato de fechas y horas</p>
                </div>
                <select
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  value={generalSettings.timezone}
                  onChange={(e) =>
                    saveSettings("general", {
                      ...generalSettings,
                      timezone: e.target.value,
                    })
                  }
                >
                  <option value="America/Mexico_City">México (GMT-6)</option>
                  <option value="America/New_York">New York (GMT-5)</option>
                  <option value="Europe/Madrid">Madrid (GMT+1)</option>
                </select>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              <Bug className="inline h-5 w-5 mr-2" />
              Configuración de Desarrollo
            </h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-900">Modo Debug</label>
                  <p className="text-xs text-gray-500">Mostrar información de depuración</p>
                </div>
                <Toggle
                  checked={generalSettings.debugMode}
                  onCheckedChange={(checked) =>
                    saveSettings("general", {
                      ...generalSettings,
                      debugMode: checked,
                    })
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-900">Analíticas</label>
                  <p className="text-xs text-gray-500">Recopilar datos de uso anónimos</p>
                </div>
                <Toggle
                  checked={generalSettings.analyticsEnabled}
                  onCheckedChange={(checked) =>
                    saveSettings("general", {
                      ...generalSettings,
                      analyticsEnabled: checked,
                    })
                  }
                />
              </div>
            </div>
          </Card>
        </div>
      )}

      {activeTab === "api-keys" && (
        <div className="space-y-6">
          <Alert variant="warning">
            <Key className="h-4 w-4" />
            <AlertTitle>Información Importante</AlertTitle>
            <AlertDescription>
              Las claves API se almacenan de forma segura. Solo se muestran los primeros y últimos
              caracteres por seguridad.
            </AlertDescription>
          </Alert>

          <div className="grid gap-4">
            {apiKeys.map((apiKey) => (
              <Card key={apiKey.provider} className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <h3 className="text-lg font-medium text-gray-900">{apiKey.name}</h3>
                      <Badge variant={apiKey.configured ? "success" : "secondary"}>
                        {apiKey.configured ? "Configurado" : "Sin configurar"}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-500 mb-3">{apiKey.description}</p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Clave API
                        </label>
                        <input
                          type="password"
                          value={apiKey.configured ? maskApiKey(apiKey.key) : ""}
                          placeholder="Ingresa tu clave API..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm"
                          onChange={(e) => {
                            const updatedKeys = apiKeys.map((key) =>
                              key.provider === apiKey.provider
                                ? {
                                    ...key,
                                    key: e.target.value,
                                    configured: e.target.value.length > 0,
                                  }
                                : key,
                            );
                            saveSettings("api-keys", updatedKeys);
                          }}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Estado
                        </label>
                        <div className="flex items-center space-x-2">
                          {apiKey.configured ? (
                            <>
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                              <span className="text-sm text-green-700">Activo</span>
                              {apiKey.lastUsed && (
                                <span className="text-xs text-gray-500">
                                  • Usado: {new Date(apiKey.lastUsed).toLocaleDateString()}
                                </span>
                              )}
                            </>
                          ) : (
                            <>
                              <XCircle className="h-4 w-4 text-gray-400" />
                              <span className="text-sm text-gray-500">No configurado</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {activeTab === "system" && (
        <div className="space-y-6">
          {/* System Services */}
          <Card className="p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              <Monitor className="inline h-5 w-5 mr-2" />
              Estado de Servicios
            </h2>
            <div className="grid gap-4">
              {systemServices.map((service) => (
                <div
                  key={service.service}
                  className="flex items-center justify-between p-4 border border-gray-200 rounded-lg"
                >
                  <div className="flex items-center space-x-3">
                    {service.status === "online" ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : service.status === "offline" ? (
                      <XCircle className="h-5 w-5 text-red-500" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-yellow-500" />
                    )}
                    <div>
                      <p className="font-medium text-gray-900">{service.service}</p>
                      <p className="text-sm text-gray-500">{service.details}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge className={getStatusColor(service.status)}>
                      {service.status === "online"
                        ? "En línea"
                        : service.status === "offline"
                          ? "Fuera de línea"
                          : "Error"}
                    </Badge>
                    {service.version && (
                      <p className="text-xs text-gray-500 mt-1">v{service.version}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* System Metrics */}
          {systemMetrics && (
            <Card className="p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                <TrendingUp className="inline h-5 w-5 mr-2" />
                Métricas del Sistema
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <MemoryStick className="h-8 w-8 text-green-500 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">Memoria RAM</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {systemMetrics.memory.percentage}%
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatFileSize(systemMetrics.memory.used * 1024 * 1024)} /{" "}
                    {formatFileSize(systemMetrics.memory.total * 1024 * 1024)}
                  </p>
                </div>
                <div className="text-center">
                  <Cpu className="h-8 w-8 text-green-500 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">CPU</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {systemMetrics.cpu.percentage}%
                  </p>
                  <p className="text-xs text-gray-500">Uso actual</p>
                </div>
                <div className="text-center">
                  <HardDrive className="h-8 w-8 text-purple-500 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">Almacenamiento</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {systemMetrics.storage.percentage}%
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatFileSize(systemMetrics.storage.used * 1024 * 1024)} /{" "}
                    {formatFileSize(systemMetrics.storage.total * 1024 * 1024)}
                  </p>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t text-center">
                <div className="flex items-center justify-center space-x-2">
                  <Clock className="h-4 w-4 text-gray-500" />
                  <span className="text-sm text-gray-600">
                    Tiempo activo: {formatUptime(systemMetrics.uptime)}
                  </span>
                </div>
              </div>
            </Card>
          )}

          {/* Database Status */}
          {databaseStatus && (
            <Card className="p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                <Database className="inline h-5 w-5 mr-2" />
                Estado de la Base de Datos
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Estado</span>
                    <div className="flex items-center space-x-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span className="text-sm text-green-700">Conectado</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Host</span>
                    <span className="text-sm text-gray-900">{databaseStatus.host}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Base de Datos</span>
                    <span className="text-sm text-gray-900">{databaseStatus.database}</span>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Tablas</span>
                    <span className="text-sm text-gray-900">{databaseStatus.tablesCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Tamaño</span>
                    <span className="text-sm text-gray-900">{databaseStatus.size}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Tiempo de Respuesta</span>
                    <span className="text-sm text-gray-900">{databaseStatus.responseTime}ms</span>
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t">
                <button
                  onClick={() => testConnection("database")}
                  className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  <TestTube className="h-4 w-4 mr-2" />
                  Probar Conexión
                </button>
              </div>
            </Card>
          )}
        </div>
      )}

      {activeTab === "mcp" && (
        <div className="space-y-6">
          <Alert variant="info">
            <Plug className="h-4 w-4" />
            <AlertTitle>Servidores MCP (Model Context Protocol)</AlertTitle>
            <AlertDescription>
              Estos servidores proporcionan contexto y herramientas adicionales para los asistentes
              de IA.
            </AlertDescription>
          </Alert>

          <div className="grid gap-4">
            {mcpServers.map((server) => (
              <Card key={server.name} className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <h3 className="text-lg font-medium text-gray-900">{server.name}</h3>
                      <Badge className={getStatusColor(server.status)}>
                        {server.status === "connected"
                          ? "Conectado"
                          : server.status === "disconnected"
                            ? "Desconectado"
                            : "Error"}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-500 mb-3">{server.description}</p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Tipo:</span>
                        <span className="ml-2 text-gray-900 capitalize">{server.type}</span>
                      </div>
                      {server.version && (
                        <div>
                          <span className="text-gray-600">Versión:</span>
                          <span className="ml-2 text-gray-900">v{server.version}</span>
                        </div>
                      )}
                      {server.lastActivity && (
                        <div>
                          <span className="text-gray-600">Última actividad:</span>
                          <span className="ml-2 text-gray-900">
                            {new Date(server.lastActivity).toLocaleString("es-ES")}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Save/Loading State */}
      {saving && (
        <div className="fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center space-x-2">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>Guardando...</span>
        </div>
      )}
    </div>
  );
}
