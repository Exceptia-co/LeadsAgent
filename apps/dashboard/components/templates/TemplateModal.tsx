"use client";

import { useState, useEffect, useRef } from "react";
import { Card } from "../ui/card";
import { X, Sparkles, Eye } from "lucide-react";
import { Template } from "./TemplateCard";
import VariablePicker from "./VariablePicker";
import AIAssistant from "./AIAssistant";

interface TemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (templateData: any) => Promise<void>;
  editingTemplate?: Template | null;
}

interface TemplateForm {
  name: string;
  category: string;
  subject: string;
  content: string;
  variables: string[];
}

export default function TemplateModal({
  isOpen,
  onClose,
  onSave,
  editingTemplate,
}: TemplateModalProps) {
  const [templateForm, setTemplateForm] = useState<TemplateForm>({
    name: "",
    category: "",
    subject: "",
    content: "",
    variables: [],
  });
  const [templatePreview, setTemplatePreview] = useState("");
  const [templateVariables, setTemplateVariables] = useState<{
    [key: string]: string;
  }>({});
  const [saving, setSaving] = useState(false);
  const [showVariablePicker, setShowVariablePicker] = useState(false);
  const [showAIHelper, setShowAIHelper] = useState(false);
  const contentTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editingTemplate) {
      setTemplateForm({
        name: editingTemplate.name,
        category: editingTemplate.category,
        subject: editingTemplate.subject || "",
        content: editingTemplate.content,
        variables: editingTemplate.variables || [],
      });
    } else {
      setTemplateForm({
        name: "",
        category: "",
        subject: "",
        content: "",
        variables: [],
      });
    }
    setTemplateVariables({});
    setTemplatePreview("");
  }, [editingTemplate, isOpen]);

  useEffect(() => {
    if (templateForm.content) {
      generateTemplatePreview();
    }
  }, [templateForm.content, templateVariables]);

  const extractVariables = (content: string): string[] => {
    const matches = content.match(/\{\{([^}]+)\}\}/g);
    if (!matches) return [];

    return Array.from(new Set(matches.map((match) => match.slice(2, -2).trim())));
  };

  const generateTemplatePreview = () => {
    if (!templateForm.content) return;

    let content = templateForm.content;
    Object.entries(templateVariables).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
      content = content.replace(regex, value || `{{${key}}}`);
    });
    setTemplatePreview(content);
  };

  const handleVariableInsert = (variable: string) => {
    if (contentTextareaRef.current) {
      const textarea = contentTextareaRef.current;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const currentContent = templateForm.content;

      const newContent =
        currentContent.substring(0, start) + variable + currentContent.substring(end);

      setTemplateForm((prev) => ({ ...prev, content: newContent }));

      // Restore cursor position after variable insertion
      setTimeout(() => {
        if (textarea) {
          const newPosition = start + variable.length;
          textarea.setSelectionRange(newPosition, newPosition);
          textarea.focus();
        }
      }, 0);
    }
  };

  const handleSave = async () => {
    if (!templateForm.name || !templateForm.category || !templateForm.content) return;

    setSaving(true);
    try {
      const variables = extractVariables(templateForm.content);
      const templateData = {
        ...templateForm,
        variables,
      };
      await onSave(templateData);
      onClose();
    } catch (error) {
      console.error("Error saving template:", error);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div className="w-full max-w-6xl max-h-[90vh] overflow-y-auto bg-white rounded-lg shadow-lg border">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold">
                {editingTemplate ? "Editar Template" : "Nuevo Template"}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Crea mensajes efectivos con variables dinámicas y asistencia IA
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowAIHelper(!showAIHelper)}
                className="flex items-center px-3 py-2 text-sm bg-gradient-to-r from-purple-600 to-green-600 text-white rounded-lg hover:from-purple-700 hover:to-green-700 transition-all"
                title="Asistencia IA"
              >
                <Sparkles className="h-4 w-4 mr-1" />
                Asistencia IA
              </button>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                <X className="h-6 w-6" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Form */}
            <div className="space-y-4 lg:col-span-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nombre del Template
                </label>
                <input
                  type="text"
                  value={templateForm.name}
                  onChange={(e) =>
                    setTemplateForm((prev) => ({
                      ...prev,
                      name: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  placeholder="Ej: Mensaje de bienvenida"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Categoría</label>
                <select
                  value={templateForm.category}
                  onChange={(e) =>
                    setTemplateForm((prev) => ({
                      ...prev,
                      category: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                >
                  <option value="">Seleccionar categoría</option>
                  <option value="welcome">Bienvenida</option>
                  <option value="pricing">Precios</option>
                  <option value="products">Productos</option>
                  <option value="follow_up">Seguimiento</option>
                  <option value="support">Soporte</option>
                  <option value="other">Otro</option>
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">Contenido</label>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => setShowVariablePicker(!showVariablePicker)}
                      className="text-xs text-green-600 hover:text-green-800 font-medium"
                    >
                      {showVariablePicker ? "Ocultar" : "Mostrar"} Variables
                    </button>
                  </div>
                </div>
                <textarea
                  ref={contentTextareaRef}
                  value={templateForm.content}
                  onChange={(e) =>
                    setTemplateForm((prev) => ({
                      ...prev,
                      content: e.target.value,
                    }))
                  }
                  rows={showVariablePicker ? 6 : 8}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 resize-none"
                  placeholder="Escribe tu mensaje aquí. Usa {{variable}} para variables dinámicas."
                />

                {/* Variable Picker Compact */}
                {showVariablePicker && (
                  <div className="mt-3">
                    <VariablePicker compact={true} onVariableSelect={handleVariableInsert} />
                  </div>
                )}
              </div>

              {/* Variables detected */}
              {extractVariables(templateForm.content).length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Variables detectadas:</h3>
                  <div className="flex flex-wrap gap-2">
                    {extractVariables(templateForm.content).map((variable) => (
                      <span
                        key={variable}
                        className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-800"
                      >
                        {`{{${variable}}}`}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Variables Panel & Preview */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-700">Variables y Vista Previa</h3>
                <Eye className="h-4 w-4 text-gray-400" />
              </div>

              {/* Variable Picker */}
              <div>
                <VariablePicker
                  onVariableSelect={handleVariableInsert}
                  compact={false}
                  showExamples={true}
                />
              </div>

              <h4 className="text-sm font-medium text-gray-700 border-t pt-4">Vista Previa</h4>

              {/* Variable inputs for preview */}
              {extractVariables(templateForm.content).length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-medium text-gray-600">Vista previa con datos:</h4>
                    <div className="flex space-x-1">
                      <button
                        onClick={() => {
                          // Cargar datos de ejemplo realistas
                          const exampleData = {
                            nombre: "María García",
                            telefono: "+34 612 345 678",
                            email: "maria@example.com",
                            estado: "NUEVO",
                            origen: "website",
                            empresa: "EscortsHub",
                            sitio_web: "www.escortshub.com",
                            telefono_soporte: "+34 900 123 456",
                            email_soporte: "soporte@escortshub.com",
                            saludo:
                              new Date().getHours() < 12
                                ? "Buenos días"
                                : new Date().getHours() < 18
                                  ? "Buenas tardes"
                                  : "Buenas noches",
                            fecha_actual: new Date().toLocaleDateString("es-ES"),
                            hora_actual: new Date().toLocaleTimeString("es-ES", {
                              hour: "2-digit",
                              minute: "2-digit",
                            }),
                            dia_semana: new Date().toLocaleDateString("es-ES", {
                              weekday: "long",
                            }),
                            mes_actual: new Date().toLocaleDateString("es-ES", {
                              month: "long",
                            }),
                          };
                          setTemplateVariables(exampleData);
                        }}
                        className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors"
                        title="Cargar datos de ejemplo"
                      >
                        Ejemplo
                      </button>
                      <button
                        onClick={() => setTemplateVariables({})}
                        className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                        title="Limpiar datos"
                      >
                        Limpiar
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {extractVariables(templateForm.content).map((variable) => (
                      <div key={variable} className="flex items-center space-x-2">
                        <label className="text-xs text-gray-500 w-16 flex-shrink-0">
                          {variable}:
                        </label>
                        <input
                          type="text"
                          placeholder={`{{${variable}}}`}
                          value={templateVariables[variable] || ""}
                          onChange={(e) =>
                            setTemplateVariables((prev) => ({
                              ...prev,
                              [variable]: e.target.value,
                            }))
                          }
                          className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-gray-50 p-4 rounded-lg border min-h-[150px]">
                <pre className="whitespace-pre-wrap text-sm text-gray-700">
                  {templatePreview || templateForm.content || "La vista previa aparecerá aquí..."}
                </pre>
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
              onClick={handleSave}
              disabled={
                saving || !templateForm.name || !templateForm.category || !templateForm.content
              }
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Guardando..." : editingTemplate ? "Actualizar" : "Crear"} Template
            </button>
          </div>
        </div>
      </div>

      {/* AI Assistant Modal */}
      {showAIHelper && (
        <AIAssistant
          mode={editingTemplate ? "improve" : "template"}
          existingContent={editingTemplate ? templateForm.content : ""}
          onTemplateGenerated={(generatedTemplate) => {
            // Aplicar el template generado al formulario
            setTemplateForm((prev) => ({
              ...prev,
              name: generatedTemplate.name || prev.name,
              category: generatedTemplate.category || prev.category,
              content: generatedTemplate.content || prev.content,
              subject: generatedTemplate.subject || prev.subject,
              variables: generatedTemplate.variables || prev.variables,
            }));
            setShowAIHelper(false);
          }}
          onContentGenerated={(content) => {
            // Aplicar solo el contenido generado
            setTemplateForm((prev) => ({
              ...prev,
              content: content,
            }));
            setShowAIHelper(false);
          }}
          onClose={() => setShowAIHelper(false)}
        />
      )}
    </div>
  );
}
