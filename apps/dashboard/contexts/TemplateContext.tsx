"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";

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

const TemplateContext = createContext<TemplateContextType | undefined>(undefined);

export const useTemplates = () => {
  const context = useContext(TemplateContext);
  if (!context) {
    throw new Error("useTemplates must be used within a TemplateProvider");
  }
  return context;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";

export function TemplateProvider({ children }: { children: React.ReactNode }) {
  const { getToken } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const authHeaders = useCallback(async (): Promise<HeadersInit> => {
    const token = await getToken();
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, [getToken]);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const headers = await authHeaders();
      const response = await fetch(`${API_BASE_URL}/templates?activeOnly=false`, { headers });

      if (!response.ok) {
        throw new Error(`Templates endpoint returned ${response.status}`);
      }

      const payload = await response.json();
      const loaded: Template[] = Array.isArray(payload) ? payload : (payload?.data ?? []);
      setTemplates(loaded);
    } catch (err) {
      console.error("Error fetching templates:", err);
      setError(err instanceof Error ? err.message : "Error desconocido");
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  const createTemplate = useCallback(
    async (templateData: any): Promise<boolean> => {
      try {
        const headers = await authHeaders();
        const response = await fetch(`${API_BASE_URL}/templates`, {
          method: "POST",
          headers,
          body: JSON.stringify(templateData),
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || `HTTP ${response.status}`);
        }

        await fetchTemplates();
        return true;
      } catch (err) {
        console.error("Error creating template:", err);
        setError(err instanceof Error ? err.message : "Error al crear template");
        return false;
      }
    },
    [authHeaders, fetchTemplates],
  );

  const updateTemplate = useCallback(
    async (id: string, templateData: any): Promise<boolean> => {
      try {
        const headers = await authHeaders();
        const response = await fetch(`${API_BASE_URL}/templates/${id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify(templateData),
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || `HTTP ${response.status}`);
        }

        setTemplates((prev) =>
          prev.map((template) =>
            template.id === id ? { ...template, ...templateData } : template,
          ),
        );
        await fetchTemplates();
        return true;
      } catch (err) {
        console.error("Error updating template:", err);
        setError(err instanceof Error ? err.message : "Error al actualizar template");
        return false;
      }
    },
    [authHeaders, fetchTemplates],
  );

  const deleteTemplate = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const headers = await authHeaders();
        const response = await fetch(`${API_BASE_URL}/templates/${id}`, {
          method: "DELETE",
          headers,
        });

        if (!response.ok && response.status !== 204) {
          const text = await response.text();
          throw new Error(text || `HTTP ${response.status}`);
        }

        setTemplates((prev) => prev.filter((template) => template.id !== id));
        return true;
      } catch (err) {
        console.error("Error deleting template:", err);
        setError(err instanceof Error ? err.message : "Error al eliminar template");
        return false;
      }
    },
    [authHeaders],
  );

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
        (template) => template.category === category && template.isActive !== false,
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
