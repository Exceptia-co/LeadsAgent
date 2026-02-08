"use client";

import { useState, useEffect } from "react";
import { Card } from "../../../components/ui/card";
import { Badge } from "../../../components/ui/badge";
import QRCodeSVG from "react-qr-code";
import { useWhatsAppApi } from "../../../hooks/use-whatsapp-api";
import { WhatsAppSession, WhatsAppMessage } from "../../../types";
import { LeadSelector } from "../../../components/LeadSelector";
import { Lead } from "../../../hooks/use-leads";
import useSocket from "../../../src/hooks/useSocket";
import { getWhatsAppUrl } from "../../../hooks/use-whatsapp-url";
import {
  Smartphone,
  Plus,
  Trash2,
  Send,
  MessageSquare,
  Activity,
  QrCode,
  Phone,
  Clock,
  AlertCircle,
  CheckCircle2,
  FileText,
  Mail,
  Loader2,
  Wifi,
  WifiOff,
  Zap,
  Circle,
} from "lucide-react";
import { Tooltip } from "../../../components/ui/tooltip";
import { useToast } from "../../../components/ui/toast";
import {
  Skeleton,
  SkeletonText,
  SkeletonCard,
  SkeletonBadge,
  SkeletonTabs,
  SkeletonSessionGrid,
} from "../../../components/ui/skeleton";
import WhatsAppConversations from "../../../components/WhatsAppConversations";
import TemplateManager from "../../../components/templates/TemplateManager";
import { Template } from "../../../components/templates/TemplateCard";
import BulkProactiveMessageSender from "../../../components/proactive/BulkProactiveMessageSender";
import ProactiveMessageHistory from "../../../components/proactive/ProactiveMessageHistory";
import { ProactiveMessage } from "../../../components/proactive/ProactiveMessageHistory";

// Status variants for sessions
const SESSION_STATUS_VARIANTS = {
  DISCONNECTED: "destructive" as const,
  CONNECTING: "warning" as const,
  CONNECTED: "success" as const,
  QR_READY: "secondary" as const,
  QR_PENDING: "secondary" as const,
};

const SESSION_STATUS_LABELS = {
  DISCONNECTED: "Desconectado",
  CONNECTING: "Conectando",
  CONNECTED: "Conectado",
  QR_READY: "QR Listo",
  QR_PENDING: "QR Pendiente",
};

export default function WhatsAppPage() {
  const [activeTab, setActiveTab] = useState<
    | "sessions"
    | "send"
    | "conversations"
    | "templates"
    | "proactive"
    | "messages"
  >("sessions");
  const [proactiveSubTab, setProactiveSubTab] = useState<"send" | "history">(
    "send",
  );
  const [sessions, setSessions] = useState<WhatsAppSession[]>([]);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [selectedSession, setSelectedSession] = useState<string>("");

  // Initialize Socket.IO for real-time updates
  const {
    connected: socketConnected,
    connecting: socketConnecting,
    error: socketError,
    sessions: socketSessions,
    connect: socketConnect,
    disconnect: socketDisconnect,
    getCurrentState,
  } = useSocket({
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  // Sync socket sessions with local state
  useEffect(() => {
    if (socketSessions.length > 0) {
      // Convert socket sessions to WhatsApp sessions format
      const convertedSessions: WhatsAppSession[] = socketSessions.map(
        (socketSession) => ({
          id: socketSession.id,
          name: socketSession.name,
          status: socketSession.status as WhatsAppSession["status"],
          phoneNumber: socketSession.phoneNumber,
          qr: socketSession.qrCode,
          createdAt: socketSession.timestamp,
          updatedAt: socketSession.timestamp,
          lastSeen: socketSession.lastActivity,
        }),
      );

      setSessions(convertedSessions);

      // Auto-select first session if none selected
      if (convertedSessions.length > 0 && !selectedSession) {
        setSelectedSession(convertedSessions[0].id);
      }

      // Update data loading state
      setDataLoading((prev) => ({ ...prev, sessions: false }));
    }
  }, [socketSessions, selectedSession]);

  // Show real-time connection status in console for debugging
  useEffect(() => {
    if (socketConnected) {
      console.log("🔌 WebSocket connected - receiving real-time updates");

      // Show successful connection toast (only once)
      showToast({
        type: "success",
        title: "🚀 Conectado en tiempo real",
        description: "Recibirás actualizaciones automáticas de WhatsApp",
      });
    } else if (socketError) {
      console.warn("⚠️ WebSocket error:", socketError);

      // Show error toast for connection issues
      showToast({
        type: "error",
        title: "⚠️ Error de conexión",
        description: "No se pudo conectar a actualizaciones en tiempo real",
      });
    }
  }, [socketConnected, socketError]);

  // Handle real-time session updates with visual feedback
  useEffect(() => {
    if (socketSessions.length > 0) {
      // Compare with previous session count for new session detection
      const previousCount = sessions.length;
      const currentCount = socketSessions.length;

      if (currentCount > previousCount && previousCount > 0) {
        // New session detected
        showToast({
          type: "info",
          title: "📱 Nueva sesión detectada",
          description: "Se ha agregado una nueva sesión de WhatsApp",
        });
      }
    }
  }, [socketSessions.length, sessions.length]);

  // Template and proactive message states
  const [templates, setTemplates] = useState<Template[]>([]);
  const [proactiveMessages, setProactiveMessages] = useState<
    ProactiveMessage[]
  >([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(
    null,
  );

  // Loading states for individual data fetching
  const [dataLoading, setDataLoading] = useState({
    sessions: true,
    templates: true,
    proactiveMessages: true,
    leads: true,
    initialLoad: true,
  });

  const { showToast } = useToast();

  const {
    getSessions,
    createSession,
    deleteSession,
    sendDirectMessage,
    getMessageAnalytics,
    isLoading,
    error,
  } = useWhatsAppApi();

  // Load sessions on component mount and data
  useEffect(() => {
    const loadAllData = async () => {
      try {
        await Promise.all([
          loadSessions(),
          loadTemplates(),
          loadProactiveMessages(),
          loadLeads(),
        ]);

        // No toast for successful initial load - keep it quiet
      } catch (error) {
        // Only show toast for critical loading errors
        showToast({
          type: "error",
          title: "Error de carga",
          description:
            "Hubo un problema al cargar algunos datos. Refresca la página.",
        });
      } finally {
        // Mark initial load as complete
        setTimeout(() => {
          setDataLoading((prev) => ({ ...prev, initialLoad: false }));
        }, 500);
      }
    };

    loadAllData();
  }, []);

  // Load templates
  const loadTemplates = async () => {
    setDataLoading((prev) => ({ ...prev, templates: true }));
    try {
      const response = await fetch(`${getWhatsAppUrl()}/templates`);
      const result = await response.json();
      if (result.success) {
        setTemplates(result.data || []);
      }
    } catch (error) {
      console.error("Error loading templates:", error);
      showToast({
        type: "error",
        title: "Error cargando plantillas",
        description: "No se pudieron cargar las plantillas de mensaje",
      });
    } finally {
      setDataLoading((prev) => ({ ...prev, templates: false }));
    }
  };

  // Load proactive messages
  const loadProactiveMessages = async () => {
    setDataLoading((prev) => ({ ...prev, proactiveMessages: true }));
    try {
      const response = await fetch(`${getWhatsAppUrl()}/proactive-messages`);
      const result = await response.json();
      if (result.success) {
        setProactiveMessages(result.data || []);
      }
    } catch (error) {
      console.error("Error loading proactive messages:", error);
      showToast({
        type: "error",
        title: "Error cargando mensajes",
        description: "No se pudieron cargar los mensajes proactivos",
      });
    } finally {
      setDataLoading((prev) => ({ ...prev, proactiveMessages: false }));
    }
  };

  // Load leads
  const loadLeads = async () => {
    setDataLoading((prev) => ({ ...prev, leads: true }));
    try {
      const response = await fetch(`${getWhatsAppUrl()}/leads`);
      const result = await response.json();
      if (result.success) {
        setLeads(result.leads || result.data || []);
      }
    } catch (error) {
      console.error("Error loading leads:", error);
      showToast({
        type: "error",
        title: "Error cargando leads",
        description: "No se pudieron cargar la lista de leads",
      });
    } finally {
      setDataLoading((prev) => ({ ...prev, leads: false }));
    }
  };

  const loadSessions = async () => {
    setDataLoading((prev) => ({ ...prev, sessions: true }));
    try {
      const data = (await getSessions()) as { sessions?: WhatsAppSession[] };
      setSessions(data.sessions || []);
      if (data.sessions && data.sessions.length > 0 && !selectedSession) {
        setSelectedSession(data.sessions[0].id);
      }
    } catch (err) {
      console.error("Error loading sessions:", err);
      showToast({
        type: "error",
        title: "Error cargando sesiones",
        description: "No se pudieron cargar las sesiones de WhatsApp",
      });
    } finally {
      setDataLoading((prev) => ({ ...prev, sessions: false }));
    }
  };

  // Handle template selection from TemplateManager
  const handleUseTemplate = (template: Template) => {
    setSelectedTemplate(template);
    setActiveTab("proactive");
    setProactiveSubTab("send");
  };

  // Handle proactive message sending with toast notifications
  const handleSendProactiveMessage = async (
    leadId: string,
    templateId?: string,
    content?: string,
    variables?: { [key: string]: string },
  ) => {
    if (!selectedSession) {
      showToast({
        type: "error",
        title: "Sin sesión seleccionada",
        description: "Por favor selecciona una sesión de WhatsApp activa",
      });
      throw new Error("No hay sesión seleccionada");
    }

    try {
      // Get sessions to ensure we have a valid session
      const sessionsResponse = await fetch(`${getWhatsAppUrl()}/sessions`);
      const sessionsResult = await sessionsResponse.json();

      let sessionId = selectedSession;

      if (sessionsResult.success && sessionsResult.sessions.length > 0) {
        sessionId = sessionsResult.sessions[0].id;
      }

      const response = await fetch(`${getWhatsAppUrl()}/proactive-messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId,
          templateId,
          sessionId,
          content,
          variables,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Error enviando mensaje");
      }

      showToast({
        type: "success",
        title: "¡Mensaje enviado!",
        description: "El mensaje proactivo se envió correctamente",
      });

      // Refresh proactive messages count
      loadProactiveMessages();
    } catch (error) {
      console.error("Error sending proactive message:", error);
      showToast({
        type: "error",
        title: "Error enviando mensaje",
        description: (error as Error).message || "Ocurrió un error inesperado",
      });
      throw error;
    }
  };

  // Handle bulk proactive message sending
  const handleBulkSendProactiveMessage = async (
    leadIds: string[],
    templateId?: string,
    content?: string,
    variables?: { [key: string]: string },
  ) => {
    if (!selectedSession) {
      showToast({
        type: "error",
        title: "Sin sesión seleccionada",
        description: "Por favor selecciona una sesión de WhatsApp activa",
      });
      throw new Error("No hay sesión seleccionada");
    }

    try {
      // Get sessions to ensure we have a valid session
      const sessionsResponse = await fetch(`${getWhatsAppUrl()}/sessions`);
      const sessionsResult = await sessionsResponse.json();

      let sessionId = selectedSession;

      if (sessionsResult.success && sessionsResult.sessions.length > 0) {
        sessionId = sessionsResult.sessions[0].id;
      }

      // Use the bulk endpoint
      const response = await fetch(
        `${getWhatsAppUrl()}/proactive-messages/bulk`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leadIds,
            templateId,
            sessionId,
            content,
            variables,
          }),
        },
      );

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Error enviando mensajes masivos");
      }

      const { successful, failed, total, errors } = result.data;

      // Show results
      if (successful > 0 && failed === 0) {
        showToast({
          type: "success",
          title: "¡Mensajes enviados!",
          description: `Se enviaron ${successful} mensajes correctamente`,
        });
      } else if (successful > 0 && failed > 0) {
        showToast({
          type: "warning",
          title: "Envío parcial",
          description: `${successful} enviados, ${failed} fallaron`,
        });
      } else {
        showToast({
          type: "error",
          title: "Error en envío masivo",
          description: `Fallaron todos los envíos (${failed})`,
        });
      }

      // Refresh proactive messages count
      loadProactiveMessages();
    } catch (error) {
      console.error("Error sending bulk proactive messages:", error);
      showToast({
        type: "error",
        title: "Error enviando mensajes",
        description: (error as Error).message || "Ocurrió un error inesperado",
      });
      throw error;
    }
  };

  // Show simple loading state during initial load
  if (dataLoading.initialLoad) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">WhatsApp Manager</h1>
        <div className="animate-pulse space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">WhatsApp Manager</h1>
        <div className="flex items-center space-x-4">
          {/* WebSocket Connection Status */}
          <div className="flex items-center space-x-2">
            {socketConnected ? (
              <Tooltip content="WebSocket conectado - Actualizaciones en tiempo real">
                <div className="flex items-center">
                  <Zap className="h-4 w-4 text-green-500 animate-pulse" />
                  <span className="text-xs text-green-600 ml-1">En vivo</span>
                </div>
              </Tooltip>
            ) : socketConnecting ? (
              <Tooltip content="Conectando a WebSocket...">
                <div className="flex items-center">
                  <Loader2 className="h-4 w-4 text-yellow-500 animate-spin" />
                  <span className="text-xs text-yellow-600 ml-1">
                    Conectando
                  </span>
                </div>
              </Tooltip>
            ) : socketError ? (
              <Tooltip content={`Error de WebSocket: ${socketError}`}>
                <div className="flex items-center">
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  <span className="text-xs text-red-600 ml-1">Error</span>
                </div>
              </Tooltip>
            ) : (
              <Tooltip content="WebSocket desconectado">
                <div className="flex items-center">
                  <Circle className="h-4 w-4 text-gray-400" />
                  <span className="text-xs text-gray-500 ml-1">
                    Desconectado
                  </span>
                </div>
              </Tooltip>
            )}
          </div>

          {/* WhatsApp Sessions Status */}
          <div className="flex items-center space-x-2">
            {sessions.filter((s) => s.status === "CONNECTED").length > 0 ? (
              <Tooltip content="Conexión establecida con WhatsApp">
                <Wifi className="h-5 w-5 text-green-500" />
              </Tooltip>
            ) : (
              <Tooltip content="Sin conexiones activas">
                <WifiOff className="h-5 w-5 text-gray-400" />
              </Tooltip>
            )}
            <span className="text-sm text-gray-600">
              {sessions.filter((s) => s.status === "CONNECTED").length} sesiones
              conectadas
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-gray-200 overflow-x-auto">
        <nav className="-mb-px flex space-x-4 sm:space-x-8 min-w-max px-1">
          {[
            {
              id: "sessions",
              label: "Sesiones",
              icon: Smartphone,
              count: sessions.length,
              countLabel: "activas",
            },
            {
              id: "conversations",
              label: "Conversaciones",
              icon: MessageSquare,
            },
            {
              id: "templates",
              label: "Templates",
              icon: FileText,
              count: templates.length,
            },
            {
              id: "proactive",
              label: "Mensajes Proactivos",
              icon: Mail,
              count: proactiveMessages.length,
            },
            {
              id: "send",
              label: "Enviar Mensaje",
              icon: Send,
            },
            {
              id: "messages",
              label: "Historial",
              icon: Activity,
            },
          ].map(({ id, label, icon: Icon, count, countLabel }) => {
            const getBadgeVariant = () => {
              if (id === "sessions") {
                const connectedCount = sessions.filter(
                  (s) => s.status === "CONNECTED",
                ).length;
                return connectedCount > 0 ? "success" : "secondary";
              }
              return count && count > 0 ? "default" : "secondary";
            };

            const getBadgeCount = () => {
              if (id === "sessions") {
                return sessions.filter((s) => s.status === "CONNECTED").length;
              }
              return count || 0;
            };

            const getTooltipContent = () => {
              if (id === "sessions") {
                const connectedCount = sessions.filter(
                  (s) => s.status === "CONNECTED",
                ).length;
                const totalCount = sessions.length;
                return `${connectedCount} de ${totalCount} sesiones conectadas`;
              }
              if (id === "templates") {
                return `${templates.length} plantillas de mensaje disponibles`;
              }
              if (id === "proactive") {
                return `${proactiveMessages.length} mensajes proactivos enviados`;
              }
              return "";
            };

            return (
              <button
                key={id}
                onClick={() => setActiveTab(id as any)}
                className={`flex items-center py-2 px-1 border-b-2 font-medium text-sm transition-all duration-200 hover:scale-105 ${
                  activeTab === id
                    ? "border-green-500 text-green-600 shadow-sm"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                <Icon
                  className={`h-4 w-4 mr-2 ${
                    activeTab === id ? "animate-pulse" : ""
                  }`}
                />
                <span className="mr-2">{label}</span>
                {count !== undefined && (
                  <Tooltip content={getTooltipContent()} position="top">
                    <Badge
                      variant={getBadgeVariant() as any}
                      className={`ml-1 text-xs px-1.5 py-0.5 min-w-[1.5rem] h-5 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 ${
                        activeTab === id ? "ring-2 ring-green-200" : ""
                      }`}
                    >
                      {getBadgeCount()}
                    </Badge>
                  </Tooltip>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === "sessions" && (
        <SessionManager
          sessions={sessions}
          onSessionsChange={loadSessions}
          createSession={createSession}
          deleteSession={deleteSession}
          isLoading={isLoading}
          error={error}
        />
      )}

      {activeTab === "send" && (
        <SendMessage
          sessions={sessions}
          selectedSession={selectedSession}
          setSelectedSession={setSelectedSession}
          sendDirectMessage={sendDirectMessage}
          isLoading={isLoading}
          error={error}
        />
      )}

      {activeTab === "conversations" && <WhatsAppConversations />}

      {activeTab === "templates" && (
        <TemplateManager
          onUseTemplate={handleUseTemplate}
          onTemplatesChange={loadTemplates}
        />
      )}

      {activeTab === "proactive" && (
        <div className="space-y-6">
          {/* Proactive Sub-navigation */}
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setProactiveSubTab("send")}
                className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                  proactiveSubTab === "send"
                    ? "border-green-500 text-green-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                <Send className="h-4 w-4 mr-2 inline" />
                Enviar Mensaje
              </button>

              <button
                onClick={() => setProactiveSubTab("history")}
                className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                  proactiveSubTab === "history"
                    ? "border-green-500 text-green-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                <MessageSquare className="h-4 w-4 mr-2 inline" />
                Historial
              </button>
            </nav>
          </div>

          {/* Sub-tab Content */}
          {proactiveSubTab === "send" && (
            <BulkProactiveMessageSender
              templates={templates}
              onBulkSendMessage={handleBulkSendProactiveMessage}
              selectedTemplate={selectedTemplate}
            />
          )}

          {proactiveSubTab === "history" && (
            <ProactiveMessageHistory leads={leads} />
          )}
        </div>
      )}

      {activeTab === "messages" && (
        <MessageHistory
          sessions={sessions}
          selectedSession={selectedSession}
          setSelectedSession={setSelectedSession}
          getMessageAnalytics={getMessageAnalytics}
          isLoading={isLoading}
          error={error}
        />
      )}
    </div>
  );
}

// Session Manager Component
function SessionManager({
  sessions,
  onSessionsChange,
  createSession,
  deleteSession,
  isLoading,
  error,
}: {
  sessions: WhatsAppSession[];
  onSessionsChange: () => void;
  createSession: (id: string, name?: string) => Promise<any>;
  deleteSession: (id: string) => Promise<any>;
  isLoading: boolean;
  error: string | null;
}) {
  const [newSessionId, setNewSessionId] = useState("");
  const [newSessionName, setNewSessionName] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSessionId.trim()) return;

    setCreating(true);
    try {
      await createSession(
        newSessionId.trim(),
        newSessionName.trim() || undefined,
      );
      setNewSessionId("");
      setNewSessionName("");
      onSessionsChange();
    } catch (err) {
      console.error("Error creating session:", err);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!confirm("¿Estás seguro de que quieres eliminar esta sesión?")) return;

    try {
      await deleteSession(sessionId);
      onSessionsChange();
    } catch (err) {
      console.error("Error deleting session:", err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Create New Session */}
      <Card className="p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">
          <Plus className="inline h-5 w-5 mr-2" />
          Crear Nueva Sesión
        </h2>
        <form onSubmit={handleCreateSession} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Session ID *
              </label>
              <input
                type="text"
                value={newSessionId}
                onChange={(e) => setNewSessionId(e.target.value)}
                placeholder="ej: leadcrm-main"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre (Opcional)
              </label>
              <input
                type="text"
                value={newSessionName}
                onChange={(e) => setNewSessionName(e.target.value)}
                placeholder="ej: Sesión Principal"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={creating || !newSessionId.trim()}
            className="bg-green-500 text-white px-4 py-2 rounded-md hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            <Plus className="h-4 w-4 mr-2" />
            {creating ? "Creando..." : "Crear Sesión"}
          </button>
        </form>
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
          <p className="text-sm text-green-800">
            <QrCode className="inline h-4 w-4 mr-1" />
            Al crear una sesión, se abrirá Chrome para escanear el código QR de
            WhatsApp.
          </p>
        </div>
      </Card>

      {/* Existing Sessions */}
      <Card className="p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">
          <Smartphone className="inline h-5 w-5 mr-2" />
          Sesiones Activas ({sessions.length})
        </h2>

        {sessions.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Smartphone className="mx-auto h-12 w-12 text-gray-300 mb-4" />
            <p>No hay sesiones creadas</p>
            <p className="text-sm">Crea tu primera sesión para comenzar</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="border border-gray-200 rounded-lg p-4"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-medium text-gray-900">
                      {session.name || session.id}
                    </h3>
                    <p className="text-sm text-gray-500">{session.id}</p>
                  </div>
                  <Badge variant={SESSION_STATUS_VARIANTS[session.status]}>
                    {SESSION_STATUS_LABELS[session.status]}
                  </Badge>
                </div>

                <div className="space-y-2 text-sm text-gray-600">
                  {session.phoneNumber && (
                    <div className="flex items-center">
                      <Phone className="h-4 w-4 mr-2" />
                      {session.phoneNumber}
                    </div>
                  )}
                  <div className="flex items-center">
                    <Clock className="h-4 w-4 mr-2" />
                    {new Date(session.updatedAt).toLocaleString("es-ES")}
                  </div>
                  {session.lastSeen && (
                    <div className="flex items-center">
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Último contacto:{" "}
                      {new Date(session.lastSeen).toLocaleString("es-ES")}
                    </div>
                  )}
                </div>

                {/* Show QR Code if session is pending */}
                {(session.status === "QR_PENDING" ||
                  session.status === "QR_READY") &&
                  session.qr && (
                    <div className="mt-4 pt-3 border-t border-gray-100">
                      <div className="flex flex-col items-center space-y-2">
                        <div className="flex items-center text-sm text-gray-700 mb-2">
                          <QrCode className="h-4 w-4 mr-2 text-green-600" />
                          <span className="font-medium">
                            Escanea este código QR
                          </span>
                        </div>
                        <div className="bg-white p-4 rounded-lg border-2 border-green-200">
                          <QRCodeSVG value={session.qr} size={200} />
                        </div>
                        <p className="text-xs text-gray-500 text-center max-w-xs">
                          Abre WhatsApp en tu teléfono y escanea este código
                          para conectar la sesión
                        </p>
                      </div>
                    </div>
                  )}

                <div className="mt-4 pt-3 border-t border-gray-100">
                  <button
                    onClick={() => handleDeleteSession(session.id)}
                    className="text-red-600 hover:text-red-800 text-sm flex items-center"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// Send Message Component
function SendMessage({
  sessions,
  selectedSession,
  setSelectedSession,
  sendDirectMessage,
  isLoading,
  error,
}: {
  sessions: WhatsAppSession[];
  selectedSession: string;
  setSelectedSession: (id: string) => void;
  sendDirectMessage: (
    sessionId: string,
    phone: string,
    message: string,
  ) => Promise<boolean>;
  isLoading: boolean;
  error: string | null;
}) {
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [useManualInput, setUseManualInput] = useState(false);

  const { showToast } = useToast();

  const connectedSessions = sessions.filter(
    (s) => s.status === "CONNECTED" || s.status === "CONNECTING",
  );

  const handleLeadSelect = (lead: Lead) => {
    setSelectedLead(lead);
    if (lead.id === "manual") {
      setUseManualInput(true);
      setPhone("");
    } else {
      setUseManualInput(false);
      setPhone(lead.phone);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSession || !phone.trim() || !message.trim()) return;

    setSending(true);
    try {
      await sendDirectMessage(selectedSession, phone.trim(), message.trim());
      setPhone("");
      setMessage("");
      showToast({
        type: "success",
        title: "Mensaje enviado correctamente",
        description: "El mensaje se envió exitosamente por WhatsApp",
      });
    } catch (err) {
      console.error("Error sending message:", err);
      showToast({
        type: "error",
        title: "Error al enviar el mensaje",
        description: err instanceof Error ? err.message : "Error desconocido",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">
          <Send className="inline h-5 w-5 mr-2" />
          Enviar Mensaje Directo
        </h2>

        {connectedSessions.length === 0 ? (
          <div className="text-center py-8">
            <AlertCircle className="mx-auto h-12 w-12 text-orange-500 mb-4" />
            <p className="text-gray-900 font-medium">
              No hay sesiones conectadas
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Crea y conecta una sesión primero en la pestaña "Sesiones"
            </p>
          </div>
        ) : (
          <form onSubmit={handleSendMessage} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sesión
              </label>
              <select
                value={selectedSession}
                onChange={(e) => setSelectedSession(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">Seleccionar sesión...</option>
                {connectedSessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.name || session.id} ({session.phoneNumber})
                  </option>
                ))}
              </select>
            </div>

            {/* Lead Selector */}
            <LeadSelector
              selectedLead={selectedLead}
              onSelectLead={handleLeadSelect}
            />

            {/* Manual phone input (only shown if manual input is selected) */}
            {useManualInput && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Número de Teléfono
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+34658333517"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Incluye el código de país (ej: +34 para España)
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Mensaje
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                placeholder="Escribe tu mensaje aquí..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                required
              />
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-red-800 text-sm flex items-center">
                  <AlertCircle className="h-4 w-4 mr-2" />
                  {error}
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={
                sending || !selectedSession || !phone.trim() || !message.trim()
              }
              className="w-full bg-green-500 text-white px-4 py-2 rounded-md hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              <Send className="h-4 w-4 mr-2" />
              {sending ? "Enviando..." : "Enviar Mensaje"}
            </button>
          </form>
        )}
      </Card>
    </div>
  );
}

// Message History Component
function MessageHistory({
  sessions,
  selectedSession,
  setSelectedSession,
  getMessageAnalytics,
  isLoading,
  error,
}: {
  sessions: WhatsAppSession[];
  selectedSession: string;
  setSelectedSession: (id: string) => void;
  getMessageAnalytics: (
    sessionId?: string,
    startDate?: string,
    endDate?: string,
  ) => Promise<any>;
  isLoading: boolean;
  error: string | null;
}) {
  const [analytics, setAnalytics] = useState<any>(null);
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
    endDate: new Date().toISOString().split("T")[0],
  });

  const loadAnalytics = async () => {
    try {
      const data = await getMessageAnalytics(
        selectedSession || undefined,
        dateRange.startDate,
        dateRange.endDate,
      );
      setAnalytics(data);
    } catch (err) {
      console.error("Error loading analytics:", err);
    }
  };

  useEffect(() => {
    if (sessions.length > 0) {
      loadAnalytics();
    }
  }, [selectedSession, dateRange]);

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card className="p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">
          <MessageSquare className="inline h-5 w-5 mr-2" />
          Historial de Mensajes
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Sesión
            </label>
            <select
              value={selectedSession}
              onChange={(e) => setSelectedSession(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">Todas las sesiones</option>
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.name || session.id}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fecha Inicio
            </label>
            <input
              type="date"
              value={dateRange.startDate}
              onChange={(e) =>
                setDateRange((prev) => ({ ...prev, startDate: e.target.value }))
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fecha Fin
            </label>
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(e) =>
                setDateRange((prev) => ({ ...prev, endDate: e.target.value }))
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
        </div>
      </Card>

      {/* Analytics */}
      {analytics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="p-6">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg">
                <Send className="h-6 w-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Enviados</p>
                <p className="text-2xl font-bold text-gray-900">
                  {analytics.totalSent || 0}
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg">
                <MessageSquare className="h-6 w-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Recibidos</p>
                <p className="text-2xl font-bold text-gray-900">
                  {analytics.totalReceived || 0}
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Phone className="h-6 w-6 text-purple-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Contactos</p>
                <p className="text-2xl font-bold text-gray-900">
                  {analytics.topContacts?.length || 0}
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <Activity className="h-6 w-6 text-yellow-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Total</p>
                <p className="text-2xl font-bold text-gray-900">
                  {(analytics.totalSent || 0) + (analytics.totalReceived || 0)}
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Top Contacts */}
      {analytics?.topContacts && analytics.topContacts.length > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Contactos Principales
          </h3>
          <div className="space-y-3">
            {analytics.topContacts.map((contact: any, index: number) => (
              <div
                key={contact.phone}
                className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
              >
                <div>
                  <p className="font-medium text-gray-900">{contact.phone}</p>
                  <p className="text-sm text-gray-500 truncate max-w-xs">
                    {contact.lastMessage}
                  </p>
                </div>
                <div className="text-right">
                  <Badge variant="secondary">{contact.count} mensajes</Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
