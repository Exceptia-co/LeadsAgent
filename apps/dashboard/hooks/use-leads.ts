import { useState, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";

export interface Lead {
  id: string;
  name: string | null;
  phone: string;
  status: string;
  email?: string | null;
  createdAt: string;
  whatsappAuthorized?: boolean;
}

export interface UseLeadsResult {
  leads: Lead[];
  isLoading: boolean;
  error: string | null;
  loadLeads: () => Promise<void>;
  refreshLeads: () => Promise<void>;
  updateLeadWhatsAppAuth: (leadId: string, authorized: boolean) => Promise<boolean>;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";

export function useLeads(): UseLeadsResult {
  const { getToken } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authHeaders = useCallback(async (): Promise<HeadersInit> => {
    const token = await getToken();
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, [getToken]);

  const loadLeads = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const headers = await authHeaders();
      const response = await fetch(`${API_BASE_URL}/leads?limit=50`, {
        headers,
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        throw new Error(`Leads endpoint returned ${response.status}`);
      }

      const payload = await response.json();
      const loaded: Lead[] = payload?.data ?? payload?.leads ?? [];
      setLeads(loaded);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load leads";
      setError(message);
      console.error("Error loading leads:", err);
    } finally {
      setIsLoading(false);
    }
  }, [authHeaders]);

  const updateLeadWhatsAppAuth = useCallback(
    async (leadId: string, authorized: boolean): Promise<boolean> => {
      try {
        const headers = await authHeaders();
        const response = await fetch(`${API_BASE_URL}/leads/${leadId}/whatsapp`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ whatsappAuthorized: authorized }),
        });

        if (!response.ok) {
          console.error("Failed to update WhatsApp authorization:", response.statusText);
          return false;
        }

        setLeads((prevLeads) =>
          prevLeads.map((lead) =>
            lead.id === leadId ? { ...lead, whatsappAuthorized: authorized } : lead,
          ),
        );
        return true;
      } catch (err) {
        console.error("Error updating WhatsApp authorization:", err);
        return false;
      }
    },
    [authHeaders],
  );

  const refreshLeads = useCallback(async () => {
    await loadLeads();
  }, [loadLeads]);

  return {
    leads,
    isLoading,
    error,
    loadLeads,
    refreshLeads,
    updateLeadWhatsAppAuth,
  };
}
