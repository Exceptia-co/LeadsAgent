"use client";

import { useState, useEffect } from "react";
import { Card } from "../ui/card";
import { X, Send } from "lucide-react";
import { Template } from "../templates/TemplateCard";
import { Lead } from "./ProactiveMessageSender";

interface SendMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (
    templateId?: string,
    content?: string,
    variables?: { [key: string]: string },
  ) => Promise<void>;
  lead: Lead;
  templates: Template[];
  selectedTemplate?: Template | null;
}

export default function SendMessageModal({
  isOpen,
  onClose,
  onSend,
  lead,
  templates,
  selectedTemplate,
}: SendMessageModalProps) {
  const [currentTemplate, setCurrentTemplate] = useState<Template | null>(
    selectedTemplate || null,
  );
  const [customMessage, setCustomMessage] = useState("");
  const [variables, setVariables] = useState<{ [key: string]: string }>({});
  const [previewContent, setPreviewContent] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (selectedTemplate) {
      setCurrentTemplate(selectedTemplate);
    }
  }, [selectedTemplate]);

  useEffect(() => {
    if (currentTemplate && lead) {
      generatePreview();
    }
  }, [currentTemplate, lead, variables]);

  const generatePreview = () => {
    if (!currentTemplate || !lead) return;

    let content = currentTemplate.content;
    const leadVariables = {
      nombre: lead.name || "Usuario",
      telefono: lead.phone,
      email: lead.email || "",
      ...variables,
    };

    Object.entries(leadVariables).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
      content = content.replace(regex, value);
    });

    setPreviewContent(content);
  };

  const handleSend = async () => {
    setSending(true);
    try {
      const content = currentTemplate ? previewContent : customMessage;
      const templateId = currentTemplate?.id;

      await onSend(templateId, content, variables);

      // Reset form
      setCurrentTemplate(null);
      setCustomMessage("");
      setVariables({});
      setPreviewContent("");
    } catch (error) {
      console.error("Error sending message:", error);
      throw error;
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white rounded-lg shadow-lg border">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold">
              Enviar mensaje a {lead.name}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Seleccionar Template (opcional)
              </label>
              <select
                value={currentTemplate?.id || ""}
                onChange={(e) => {
                  const template = templates.find(
                    (t) => t.id === e.target.value,
                  );
                  setCurrentTemplate(template || null);
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

            {currentTemplate && currentTemplate.variables.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">
                  Variables del Template
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {currentTemplate.variables.map((variable) => (
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
                  Vista Previa
                </h3>
                <div className="bg-gray-50 p-4 rounded-lg border">
                  <pre className="whitespace-pre-wrap text-sm text-gray-700">
                    {currentTemplate ? previewContent : customMessage}
                  </pre>
                </div>
              </div>
            )}
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
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              <Send className="h-4 w-4 mr-2" />
              {sending ? "Enviando..." : "Enviar Mensaje"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
