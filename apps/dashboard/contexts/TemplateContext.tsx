"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { getWhatsAppUrl } from "../hooks/use-whatsapp-url";

export interface Template {
  id: string;
  name: string;
  category: string;
  subject?: string;
  content: string;
  variables: string[];
  usageCount?: number;
  isActive?: boolean;
  createdAt?: string;
}

interface TemplateContextType {
  templates: Template[];
  loading: boolean;
  error: string | null;

  // Actions
  fetchTemplates: () => Promise<void>;
  createTemplate: (templateData: any) => Promise<boolean>;
  updateTemplate: (id: string, templateData: any) => Promise<boolean>;
  deleteTemplate: (id: string) => Promise<boolean>;
  refreshTemplates: () => void;

  // Getters
  getTemplateById: (id: string) => Template | undefined;
  getTemplatesByCategory: (category: string) => Template[];
}

const TemplateContext = createContext<TemplateContextType | undefined>(
  undefined,
);

export const useTemplates = () => {
  const context = useContext(TemplateContext);
  if (!context) {
    throw new Error("useTemplates must be used within a TemplateProvider");
  }
  return context;
};

export function TemplateProvider({ children }: { children: React.ReactNode }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${getWhatsAppUrl()}/templates`);
      const result = await response.json();

      if (result.success) {
        setTemplates(result.data || []);
      } else {
        throw new Error(result.error || "Error al obtener templates");
      }
    } catch (err) {
      console.error("Error fetching templates:", err);
      setError(err instanceof Error ? err.message : "Error desconocido");

      // Fallback to mock data for development
      setTemplates([
        {
          id: "mock_1",
          name: "Mensaje de Bienvenida",
          category: "welcome",
          content: "¡Hola {{nombre}}! 👋\n\nBienvenido/a a EscortsHub.",
          variables: ["nombre"],
          usageCount: 0,
          isActive: true,
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  const createTemplate = useCallback(
    async (templateData: any): Promise<boolean> => {
      try {
        const response = await fetch(`${getWhatsAppUrl()}/templates`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(templateData),
        });

        const result = await response.json();

        if (result.success) {
          // Refetch templates to get the latest data
          await fetchTemplates();
          return true;
        } else {
          throw new Error(result.error || "Error al crear template");
        }
      } catch (err) {
        console.error("Error creating template:", err);
        setError(
          err instanceof Error ? err.message : "Error al crear template",
        );
        return false;
      }
    },
    [fetchTemplates],
  );

  const updateTemplate = useCallback(
    async (id: string, templateData: any): Promise<boolean> => {
      try {
        const response = await fetch(`${getWhatsAppUrl()}/templates/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(templateData),
        });

        const result = await response.json();

        if (result.success) {
          // Update local state immediately for better UX
          setTemplates((prev) =>
            prev.map((template) =>
              template.id === id ? { ...template, ...templateData } : template,
            ),
          );

          // Then refetch to ensure consistency
          await fetchTemplates();
          return true;
        } else {
          throw new Error(result.error || "Error al actualizar template");
        }
      } catch (err) {
        console.error("Error updating template:", err);
        setError(
          err instanceof Error ? err.message : "Error al actualizar template",
        );
        return false;
      }
    },
    [fetchTemplates],
  );

  const deleteTemplate = useCallback(async (id: string): Promise<boolean> => {
    try {
      const response = await fetch(`${getWhatsAppUrl()}/templates/${id}`, {
        method: "DELETE",
      });

      const result = await response.json();

      if (result.success) {
        // Update local state immediately
        setTemplates((prev) => prev.filter((template) => template.id !== id));
        return true;
      } else {
        throw new Error(result.error || "Error al eliminar template");
      }
    } catch (err) {
      console.error("Error deleting template:", err);
      setError(
        err instanceof Error ? err.message : "Error al eliminar template",
      );
      return false;
    }
  }, []);

  const refreshTemplates = useCallback(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const getTemplateById = useCallback(
    (id: string): Template | undefined => {
      return templates.find((template) => template.id === id);
    },
    [templates],
  );

  const getTemplatesByCategory = useCallback(
    (category: string): Template[] => {
      return templates.filter(
        (template) =>
          template.category === category && template.isActive !== false,
      );
    },
    [templates],
  );

  // Initial load
  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  return (
    <TemplateContext.Provider
      value={{
        templates,
        loading,
        error,
        fetchTemplates,
        createTemplate,
        updateTemplate,
        deleteTemplate,
        refreshTemplates,
        getTemplateById,
        getTemplatesByCategory,
      }}
    >
      {children}
    </TemplateContext.Provider>
  );
}
