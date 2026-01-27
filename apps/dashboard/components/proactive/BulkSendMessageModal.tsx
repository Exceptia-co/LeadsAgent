"use client";

import { useState, useEffect, useRef } from "react";
import { getWhatsAppUrl } from "../../hooks/use-whatsapp-url";
import { X, Send, Users, AlertTriangle, RefreshCw } from "lucide-react";
import { Template } from "../templates/TemplateCard";
import { Lead } from "./ProactiveMessageSender";

interface BulkSendMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (
    templateId?: string,
    content?: string,
    variables?: { [key: string]: string },
  ) => Promise<void>;
  selectedLeads: Lead[];
  templates: Template[];
  selectedTemplate?: Template | null;
}

export default function BulkSendMessageModal({
  isOpen,
  onClose,
  onSend,
  selectedLeads,
  templates,
  selectedTemplate,
}: BulkSendMessageModalProps) {
  const [currentTemplate, setCurrentTemplate] = useState<Template | null>(
    selectedTemplate || null,
  );
  const [customMessage, setCustomMessage] = useState("");
  const [previewContent, setPreviewContent] = useState("");
  const [sending, setSending] = useState(false);
  const [refreshingTemplates, setRefreshingTemplates] = useState(false);
  const [localTemplates, setLocalTemplates] = useState<Template[]>(templates);
  const modalRef = useRef<HTMLDivElement>(null);

  // Sincronizar templates locales con props
  useEffect(() => {
    setLocalTemplates(templates);
  }, [templates]);

  useEffect(() => {
    if (selectedTemplate) {
      setCurrentTemplate(selectedTemplate);
    }
  }, [selectedTemplate]);

  useEffect(() => {
    if (currentTemplate) {
      generatePreview();
    }
  }, [currentTemplate]);

  // Click fuera del modal para cerrarlo
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        modalRef.current &&
        !modalRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [isOpen, onClose]);

  const generatePreview = () => {
    if (!currentTemplate) return;

    let content = currentTemplate.content;
    const sampleLead = selectedLeads[0] || {
      name: "Usuario",
      phone: "+34000000000",
      email: "",
    };
    const leadVariables = {
      nombre: sampleLead.name || "Usuario",
      telefono: sampleLead.phone,
      email: sampleLead.email || "",
    };

    Object.entries(leadVariables).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
      content = content.replace(regex, value);
    });

    setPreviewContent(content);
  };

  // Función para refrescar templates
  const handleRefreshTemplates = async () => {
    setRefreshingTemplates(true);
    try {
      const response = await fetch(`${getWhatsAppUrl()}/templates`);
      const result = await response.json();
      if (result.success) {
        setLocalTemplates(result.data || []);
      }
    } catch (error) {
      console.error("Error refreshing templates:", error);
    } finally {
      setRefreshingTemplates(false);
    }
  };

  const handleSend = async () => {
    setSending(true);
    try {
      const content = currentTemplate ? previewContent : customMessage;
      const templateId = currentTemplate?.id;

      await onSend(templateId, content, undefined);

      // Reset form
      setCurrentTemplate(null);
      setCustomMessage("");
      setPreviewContent("");
    } catch (error) {
      console.error("Error sending bulk messages:", error);
      throw error;
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div
        ref={modalRef}
        className="w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-white rounded-lg shadow-lg border"
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <Users className="h-6 w-6 text-green-600" />
              <div>
                <h2 className="text-xl font-semibold">Enviar Mensaje Masivo</h2>
                <p className="text-sm text-gray-600">
                  {selectedLeads.length} lead
                  {selectedLeads.length !== 1 ? "s" : ""} seleccionado
                  {selectedLeads.length !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Selected Leads Preview */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">
              Leads Seleccionados
            </h3>
            <div className="bg-gray-50 rounded-lg p-4 max-h-32 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {selectedLeads.slice(0, 10).map((lead) => (
                  <div key={lead.id} className="text-sm">
                    <span className="font-medium">
                      {lead.name || "Sin nombre"}
                    </span>
                    <span className="text-gray-500 ml-2">{lead.phone}</span>
                  </div>
                ))}
                {selectedLeads.length > 10 && (
                  <div className="text-sm text-gray-500 italic">
                    y {selectedLeads.length - 10} más...
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Seleccionar Template (opcional)
                </label>
                <button
                  onClick={handleRefreshTemplates}
                  disabled={refreshingTemplates}
                  className="flex items-center space-x-1 px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded border transition-colors disabled:opacity-50"
                  title="Refrescar templates"
                >
                  <RefreshCw
                    className={`h-3 w-3 ${refreshingTemplates ? "animate-spin" : ""}`}
                  />
                  <span>Refrescar</span>
                </button>
              </div>
              <select
                value={currentTemplate?.id || ""}
                onChange={(e) => {
                  const template = localTemplates.find(
                    (t) => t.id === e.target.value,
                  );
                  setCurrentTemplate(template || null);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
              >
                <option value="">Sin template - Mensaje personalizado</option>
                {localTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </div>

            {!currentTemplate && (
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

            {(currentTemplate || customMessage) && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  Vista Previa (Ejemplo con primer lead)
                </h3>
                <div className="bg-gray-50 p-4 rounded-lg border">
                  <pre className="whitespace-pre-wrap text-sm text-gray-700">
                    {currentTemplate ? previewContent : customMessage}
                  </pre>
                </div>
              </div>
            )}

            {/* Warning about bulk sending */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex">
                <AlertTriangle className="h-5 w-5 text-amber-400 mt-0.5" />
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-amber-800">
                    Envío Masivo
                  </h3>
                  <div className="mt-2 text-sm text-amber-700">
                    <p>
                      Se enviará el mismo mensaje a todos los leads
                      seleccionados. Las variables personales (nombre, teléfono,
                      email) se completarán automáticamente para cada
                      destinatario.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-3 mt-6 pt-6 border-t">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancelar
            </button>

            <button
              onClick={handleSend}
              disabled={sending || (!currentTemplate && !customMessage)}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              <Send className="h-4 w-4 mr-2" />
              {sending
                ? "Enviando..."
                : `Enviar a ${selectedLeads.length} lead${selectedLeads.length !== 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
