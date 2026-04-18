"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { getWhatsAppUrl } from "../../../hooks/use-whatsapp-url";
import { Card } from "../../../components/ui/card";
import { Badge } from "../../../components/ui/badge";
import {
  Send,
  User,
  MessageSquare,
  Search,
  Filter,
  Eye,
  X,
  CheckCircle,
  Clock,
  AlertCircle,
  XCircle,
  Plus,
  Edit,
} from "lucide-react";
import { useTemplates } from "../../../contexts/TemplateContext";
import { useWhatsApp } from "../../../contexts/WhatsAppContext";
import { useToast } from "../../../components/ui/toast";

interface Lead {
  id: string;
  name: string;
  phone: string;
  email?: string;
  status: string;
  whatsappAuthorized?: boolean;
}

interface Template {
  id: string;
  name: string;
  category: string;
  content: string;
  variables: string[];
}

interface ProactiveMessage {
  id: string;
  leadId: string;
  templateId?: string;
  templateName?: string;
  phoneNumber: string;
  content: string;
  status: "pending" | "sent" | "delivered" | "failed";
  sentAt?: string;
  deliveredAt?: string;
  errorMessage?: string;
  createdAt: string;
}

export default function ProactivePage() {
  const { getToken } = useAuth();
  const { templates } = useTemplates();
  const { validateSessionForSending } = useWhatsApp();
  const { showToast } = useToast();

  // Helper functions for different toast types
  const success = (title: string, description?: string) => {
    showToast({ type: "success", title, description });
  };

  const showError = (title: string, description?: string) => {
    showToast({ type: "error", title, description });
  };

  const warning = (title: string, description?: string) => {
    showToast({ type: "warning", title, description });
  };

  const [leads, setLeads] = useState<Lead[]>([]);
  const [proactiveMessages, setProactiveMessages] = useState<ProactiveMessage[]>([]);
  const [filteredLeads, setFilteredLeads] = useState<Lead[]>([]);

  // Estados del componente
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"send" | "history">("send");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Modal de envío
  const [showSendModal, setShowSendModal] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [customMessage, setCustomMessage] = useState("");
  const [previewContent, setPreviewContent] = useState("");
  const [variables, setVariables] = useState<{ [key: string]: string }>({});
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    // Filtrar leads
    const filtered = leads.filter((lead) => {
      const matchesSearch =
        lead.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        lead.phone.includes(searchTerm);
      const isAuthorized = lead.whatsappAuthorized !== false; // Include undefined as true
      return matchesSearch && isAuthorized;
    });
    setFilteredLeads(filtered);
  }, [leads, searchTerm]);

  useEffect(() => {
    if (selectedTemplate && selectedLead) {
      generatePreview();
    }
  }, [selectedTemplate, selectedLead, variables]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const authHeaders: HeadersInit = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      // Leads → Nest API (el whatsapp-service ya no expone /leads tras T0.7)
      const leadsResponse = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || ""}/leads?limit=200`,
        { headers: authHeaders },
      );
      const leadsResult = await leadsResponse.json();

      // Proactive messages → whatsapp-service vía proxy firmado
      const messagesResponse = await fetch(`${getWhatsAppUrl()}/proactive-messages`);
      const messagesResult = await messagesResponse.json();

      setLeads(leadsResult?.data ?? leadsResult?.leads ?? []);

      if (messagesResult.success) {
        setProactiveMessages(messagesResult.data);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      // Mock data para desarrollo
      setLeads([
        {
          id: "1",
          name: "Juan Pérez",
          phone: "+5491123456789",
          email: "juan@example.com",
          status: "NUEVO",
          whatsappAuthorized: true,
        },
        {
          id: "2",
          name: "María García",
          phone: "+5491187654321",
          email: "maria@example.com",
          status: "QUALIFIED",
          whatsappAuthorized: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const generatePreview = () => {
    if (!selectedTemplate || !selectedLead) return;

    let content = selectedTemplate.content;
    const leadVariables = {
      nombre: selectedLead.name || "Usuario",
      telefono: selectedLead.phone,
      email: selectedLead.email || "",
      ...variables,
    };

    // Reemplazar variables
    Object.entries(leadVariables).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
      content = content.replace(regex, value);
    });

    setPreviewContent(content);
  };

  const handleSendMessage = async () => {
    if (!selectedLead) return;

    setSending(true);
    try {
      // Validar sesiones WhatsApp antes de enviar
      const sessionValidation = await validateSessionForSending();

      if (!sessionValidation.isValid) {
        showError(
          "Error de sesión WhatsApp",
          sessionValidation.error || "No se pudo validar la sesión",
        );
        return;
      }

      // Mostrar advertencia si estamos en modo demo
      const sessionId = sessionValidation.session?.id || "demo-session";
      if (sessionId === "demo-session" || sessionId.includes("demo")) {
        warning(
          "Modo de prueba activado",
          "El mensaje se enviará en modo de prueba. Para envío real, configura una sesión WhatsApp activa.",
        );
      }

      const content = selectedTemplate ? previewContent : customMessage;

      const response = await fetch(`${getWhatsAppUrl()}/proactive-messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: selectedLead.id,
          templateId: selectedTemplate?.id,
          sessionId,
          content,
          variables,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setShowSendModal(false);
        resetSendForm();
        await fetchData(); // Refresh data

        // Switch to history tab to see the sent message
        setActiveTab("history");

        success("¡Mensaje enviado!", `Mensaje enviado exitosamente a ${selectedLead.name}`);
      } else {
        showError("Error al enviar mensaje", result.error || "Error desconocido");
      }
    } catch (error) {
      console.error("Error sending message:", error);
      showError(
        "Error de conexión",
        "Error enviando mensaje. Verifica que el servicio esté funcionando.",
      );
    } finally {
      setSending(false);
    }
  };

  const resetSendForm = () => {
    setSelectedLead(null);
    setSelectedTemplate(null);
    setCustomMessage("");
    setPreviewContent("");
    setVariables({});
  };

  const openSendModal = (lead: Lead) => {
    setSelectedLead(lead);
    setShowSendModal(true);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending":
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case "sent":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "delivered":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusLabel = (status: string) => {
    const labels = {
      pending: "Pendiente",
      sent: "Enviado",
      delivered: "Entregado",
      failed: "Falló",
    };
    return labels[status as keyof typeof labels] || status;
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "delivered":
        return "success";
      case "sent":
        return "default";
      case "pending":
        return "secondary";
      case "failed":
        return "destructive";
      default:
        return "outline";
    }
  };

  const filteredMessages = proactiveMessages.filter((message) => {
    if (statusFilter === "all") return true;
    return message.status === statusFilter;
  });

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Mensajes Proactivos</h1>
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
          <h1 className="text-2xl font-bold text-gray-900">Mensajes Proactivos</h1>
          <p className="text-gray-500">
            Inicia conversaciones con tus leads usando templates personalizados
          </p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab("send")}
            className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === "send"
                ? "border-green-500 text-green-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            <Send className="h-4 w-4 mr-2 inline" />
            Enviar Mensaje
          </button>

          <button
            onClick={() => setActiveTab("history")}
            className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === "history"
                ? "border-green-500 text-green-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            <MessageSquare className="h-4 w-4 mr-2 inline" />
            Historial ({proactiveMessages.length})
          </button>
        </nav>
      </div>

      {/* Send Tab */}
      {activeTab === "send" && (
        <div className="space-y-6">
          {/* Search */}
          <Card className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                type="text"
                placeholder="Buscar leads por nombre o teléfono..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-3 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
            </div>
          </Card>

          {/* Leads List */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredLeads.map((lead) => (
              <Card key={lead.id} className="p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-medium text-gray-900">{lead.name || "Sin nombre"}</h3>
                    <p className="text-sm text-gray-600">{lead.phone}</p>
                    {lead.email && <p className="text-xs text-gray-500">{lead.email}</p>}
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {lead.status}
                  </Badge>
                </div>

                <button
                  onClick={() => openSendModal(lead)}
                  className="w-full flex items-center justify-center px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                >
                  <Send className="h-4 w-4 mr-2" />
                  Enviar Mensaje
                </button>
              </Card>
            ))}
          </div>

          {filteredLeads.length === 0 && (
            <Card className="p-12 text-center">
              <User className="mx-auto h-12 w-12 text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No hay leads disponibles</h3>
              <p className="text-gray-500">
                {searchTerm
                  ? "No se encontraron leads con los criterios de búsqueda."
                  : "No hay leads autorizados para WhatsApp disponibles."}
              </p>
            </Card>
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === "history" && (
        <div className="space-y-6">
          {/* Filter */}
          <Card className="p-4">
            <div className="flex items-center space-x-4">
              <Filter className="h-4 w-4 text-gray-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
              >
                <option value="all">Todos los estados</option>
                <option value="pending">Pendientes</option>
                <option value="sent">Enviados</option>
                <option value="delivered">Entregados</option>
                <option value="failed">Fallidos</option>
              </select>
            </div>
          </Card>

          {/* Messages List */}
          <div className="space-y-4">
            {filteredMessages.map((message) => {
              const lead = leads.find((l) => l.id === message.leadId);
              return (
                <Card key={message.id} className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-start space-x-4">
                      <div className="flex items-center justify-center w-10 h-10 bg-green-100 rounded-full">
                        <User className="h-5 w-5 text-green-600" />
                      </div>

                      <div>
                        <h3 className="font-medium text-gray-900">
                          {lead?.name || "Lead desconocido"}
                        </h3>
                        <p className="text-sm text-gray-600">{message.phoneNumber}</p>
                        {message.templateName && (
                          <p className="text-xs text-green-600">Template: {message.templateName}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      {getStatusIcon(message.status)}
                      <Badge variant={getStatusVariant(message.status) as any} className="text-xs">
                        {getStatusLabel(message.status)}
                      </Badge>
                    </div>
                  </div>

                  <div className="bg-gray-50 p-4 rounded-lg mb-4">
                    <pre className="whitespace-pre-wrap text-sm text-gray-700">
                      {message.content}
                    </pre>
                  </div>

                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>Creado: {new Date(message.createdAt).toLocaleString("es-ES")}</span>

                    {message.sentAt && (
                      <span>Enviado: {new Date(message.sentAt).toLocaleString("es-ES")}</span>
                    )}

                    {message.deliveredAt && (
                      <span>
                        Entregado: {new Date(message.deliveredAt).toLocaleString("es-ES")}
                      </span>
                    )}
                  </div>

                  {message.errorMessage && (
                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                      Error: {message.errorMessage}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          {filteredMessages.length === 0 && (
            <Card className="p-12 text-center">
              <MessageSquare className="mx-auto h-12 w-12 text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No hay mensajes</h3>
              <p className="text-gray-500">
                {statusFilter !== "all"
                  ? `No hay mensajes con estado "${getStatusLabel(statusFilter)}".`
                  : "No se han enviado mensajes proactivos aún."}
              </p>
            </Card>
          )}
        </div>
      )}

      {/* Send Message Modal */}
      {showSendModal && selectedLead && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold">Enviar mensaje a {selectedLead.name}</h2>
                <button
                  onClick={() => setShowSendModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="space-y-6">
                {/* Template Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Seleccionar Template (opcional)
                  </label>
                  <select
                    value={selectedTemplate?.id || ""}
                    onChange={(e) => {
                      const template = templates.find((t) => t.id === e.target.value);
                      setSelectedTemplate(template || null);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  >
                    <option value="">Sin template - Mensaje personalizado</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Template Variables */}
                {selectedTemplate && selectedTemplate.variables.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-3">
                      Variables del Template
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {selectedTemplate.variables.map((variable) => (
                        <div key={variable}>
                          <label className="block text-xs text-gray-600 mb-1 capitalize">
                            {variable}
                          </label>
                          <input
                            type="text"
                            value={variables[variable] || ""}
                            onChange={(e) =>
                              setVariables((prev) => ({
                                ...prev,
                                [variable]: e.target.value,
                              }))
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm"
                            placeholder={`Valor para {{${variable}}}`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Custom Message */}
                {!selectedTemplate && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Mensaje Personalizado
                    </label>
                    <textarea
                      value={customMessage}
                      onChange={(e) => setCustomMessage(e.target.value)}
                      rows={6}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 resize-none"
                      placeholder="Escribe tu mensaje personalizado..."
                    />
                  </div>
                )}

                {/* Preview */}
                {(selectedTemplate || customMessage) && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Vista Previa</h3>
                    <div className="bg-gray-50 p-4 rounded-lg border">
                      <pre className="whitespace-pre-wrap text-sm text-gray-700">
                        {selectedTemplate ? previewContent : customMessage}
                      </pre>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-3 mt-6 pt-6 border-t">
                <button
                  onClick={() => setShowSendModal(false)}
                  className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancelar
                </button>

                <button
                  onClick={handleSendMessage}
                  disabled={sending || (!selectedTemplate && !customMessage)}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  <Send className="h-4 w-4 mr-2" />
                  {sending ? "Enviando..." : "Enviar Mensaje"}
                </button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
