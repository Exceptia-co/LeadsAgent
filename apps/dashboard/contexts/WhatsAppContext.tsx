"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { useToast } from "../components/ui/toast";
import { getWhatsAppUrl } from "../hooks/use-whatsapp-url";

export interface WhatsAppSession {
  id: string;
  name?: string;
  phoneNumber?: string;
  status:
    | "DISCONNECTED"
    | "CONNECTING"
    | "CONNECTED"
    | "QR_PENDING"
    | "QR_READY";
  qrCode?: string;
  lastActivity?: string;
  createdAt?: string;
}

interface WhatsAppContextType {
  sessions: WhatsAppSession[];
  loading: boolean;
  error: string | null;

  // Actions
  fetchSessions: () => Promise<void>;
  createSession: (sessionData: any) => Promise<boolean>;
  deleteSession: (sessionId: string) => Promise<boolean>;

  // Session validation
  validateSessionForSending: (
    sessionId?: string,
  ) => Promise<{ isValid: boolean; session?: WhatsAppSession; error?: string }>;
  getActiveSessions: () => WhatsAppSession[];
  getBestSessionForSending: () => WhatsAppSession | undefined;

  // Refresh methods
  refreshSessions: () => void;
}

const WhatsAppContext = createContext<WhatsAppContextType | undefined>(
  undefined,
);

export const useWhatsApp = () => {
  const context = useContext(WhatsAppContext);
  if (!context) {
    throw new Error("useWhatsApp must be used within a WhatsAppProvider");
  }
  return context;
};

export function WhatsAppProvider({ children }: { children: React.ReactNode }) {
  const [sessions, setSessions] = useState<WhatsAppSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();
  const showError = (title: string, message?: string) =>
    showToast({ type: "error", title, description: message });
  const showWarning = (title: string, message?: string) =>
    showToast({ type: "warning", title, description: message });

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${getWhatsAppUrl()}/sessions`);
      const result = await response.json();

      if (result.success) {
        setSessions(result.sessions || []);
      } else {
        throw new Error(result.error || "Error al obtener sesiones");
      }
    } catch (err) {
      console.error("Error fetching sessions:", err);
      setError(err instanceof Error ? err.message : "Error desconocido");

      // Set empty sessions array if error
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const createSession = useCallback(
    async (sessionData: any): Promise<boolean> => {
      try {
        const response = await fetch(`${getWhatsAppUrl()}/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sessionData),
        });

        const result = await response.json();

        if (result.success) {
          await fetchSessions();
          return true;
        } else {
          throw new Error(result.error || "Error al crear sesión");
        }
      } catch (err) {
        console.error("Error creating session:", err);
        setError(err instanceof Error ? err.message : "Error al crear sesión");
        showError(
          "Error al crear sesión",
          err instanceof Error ? err.message : "Error desconocido",
        );
        return false;
      }
    },
    [fetchSessions, showError],
  );

  const deleteSession = useCallback(
    async (sessionId: string): Promise<boolean> => {
      try {
        const response = await fetch(
          `${getWhatsAppUrl()}/sessions/${sessionId}`,
          {
            method: "DELETE",
          },
        );

        const result = await response.json();

        if (result.success) {
          setSessions((prev) =>
            prev.filter((session) => session.id !== sessionId),
          );
          return true;
        } else {
          throw new Error(result.error || "Error al eliminar sesión");
        }
      } catch (err) {
        console.error("Error deleting session:", err);
        setError(
          err instanceof Error ? err.message : "Error al eliminar sesión",
        );
        showError(
          "Error al eliminar sesión",
          err instanceof Error ? err.message : "Error desconocido",
        );
        return false;
      }
    },
    [showError],
  );

  const validateSessionForSending = useCallback(
    async (
      sessionId?: string,
    ): Promise<{
      isValid: boolean;
      session?: WhatsAppSession;
      error?: string;
    }> => {
      try {
        // Refresh sessions data first
        await fetchSessions();

        let targetSession: WhatsAppSession | undefined;

        if (sessionId) {
          targetSession = sessions.find((s) => s.id === sessionId);
          if (!targetSession) {
            return {
              isValid: false,
              error: "La sesión especificada no existe",
            };
          }
        } else {
          // Find the best session for sending
          targetSession = getBestSessionForSending();
          if (!targetSession) {
            return {
              isValid: false,
              error:
                "No hay sesiones WhatsApp disponibles. Crea y conecta una sesión primero.",
            };
          }
        }

        // Validate session status
        switch (targetSession.status) {
          case "CONNECTED":
            return {
              isValid: true,
              session: targetSession,
            };

          case "CONNECTING":
            return {
              isValid: false,
              session: targetSession,
              error:
                "La sesión está conectándose. Espera a que se establezca la conexión.",
            };

          case "QR_PENDING":
            return {
              isValid: false,
              session: targetSession,
              error:
                "Escanea el código QR para completar la conexión WhatsApp.",
            };

          case "DISCONNECTED":
          default:
            return {
              isValid: false,
              session: targetSession,
              error:
                "La sesión WhatsApp está desconectada. Reconecta la sesión e inténtalo nuevamente.",
            };
        }
      } catch (err) {
        console.error("Error validating session:", err);
        return {
          isValid: false,
          error: "Error al validar la sesión WhatsApp",
        };
      }
    },
    [sessions, fetchSessions],
  );

  const getActiveSessions = useCallback((): WhatsAppSession[] => {
    return sessions.filter((s) => s.status === "CONNECTED");
  }, [sessions]);

  const getBestSessionForSending = useCallback(():
    | WhatsAppSession
    | undefined => {
    const connectedSessions = getActiveSessions();
    if (connectedSessions.length > 0) {
      // Return the first connected session
      return connectedSessions[0];
    }

    // If no connected sessions, return the first available session
    return sessions.length > 0 ? sessions[0] : undefined;
  }, [sessions, getActiveSessions]);

  const refreshSessions = useCallback(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Initial load
  useEffect(() => {
    fetchSessions();

    // Set up polling for session status updates every 30 seconds
    const interval = setInterval(() => {
      fetchSessions();
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchSessions]);

  return (
    <WhatsAppContext.Provider
      value={{
        sessions,
        loading,
        error,
        fetchSessions,
        createSession,
        deleteSession,
        validateSessionForSending,
        getActiveSessions,
        getBestSessionForSending,
        refreshSessions,
      }}
    >
      {children}
    </WhatsAppContext.Provider>
  );
}
