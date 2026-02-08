import { useEffect, useState, useCallback, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { getWhatsAppUrl } from "../../hooks/use-whatsapp-url";

export interface WhatsAppSession {
  id: string;
  name: string;
  status: "CONNECTED" | "CONNECTING" | "DISCONNECTED" | "QR_PENDING";
  phoneNumber?: string;
  qrCode?: string;
  lastActivity?: string;
  timestamp: string;
}

export interface SocketEvents {
  "connection:established": (data: {
    clientId: string;
    timestamp: string;
    message: string;
  }) => void;

  "sessions:current_state": (data: {
    sessions: WhatsAppSession[];
    timestamp: string;
  }) => void;

  "session:status_changed": (data: {
    sessionId: string;
    status: string;
    phoneNumber?: string;
    qrCode?: string;
    timestamp: string;
    metadata?: any;
  }) => void;

  "session:qr_updated": (data: {
    sessionId: string;
    qrCode: string;
    timestamp: string;
  }) => void;

  "session:connected": (data: {
    sessionId: string;
    status: string;
    phoneNumber: string;
    timestamp: string;
  }) => void;

  "session:disconnected": (data: {
    sessionId: string;
    status: string;
    reason?: string;
    timestamp: string;
  }) => void;

  "server:shutdown": (data: { message: string; timestamp: string }) => void;

  error: (data: { message: string; timestamp: string }) => void;
}

export type SocketEventName = keyof SocketEvents;

interface UseSocketOptions {
  autoConnect?: boolean;
  reconnection?: boolean;
  reconnectionAttempts?: number;
  reconnectionDelay?: number;
}

interface UseSocketReturn {
  socket: Socket | null;
  connected: boolean;
  connecting: boolean;
  error: string | null;
  sessions: WhatsAppSession[];
  connect: () => void;
  disconnect: () => void;
  emit: (event: string, data?: any) => void;
  on: <T extends SocketEventName>(event: T, handler: SocketEvents[T]) => void;
  off: (event: SocketEventName, handler?: (...args: any[]) => void) => void;
  getCurrentState: () => void;
}

export const useSocket = (options: UseSocketOptions = {}): UseSocketReturn => {
  const {
    autoConnect = true,
    reconnection = true,
    reconnectionAttempts = 5,
    reconnectionDelay = 1000,
  } = options;

  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<WhatsAppSession[]>([]);

  const socketRef = useRef<Socket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);

  // Get WebSocket server URL from environment or use default
  const getSocketUrl = useCallback(() => {
    // For production, check for dedicated WebSocket URL
    const wsUrl = process.env.NEXT_PUBLIC_WEBSOCKET_URL;
    if (wsUrl) {
      return wsUrl;
    }

    // Try to get from environment variables
    if (typeof window !== "undefined") {
      const hostname = window.location.hostname;
      const isLocal = hostname === "localhost" || hostname === "127.0.0.1";

      if (isLocal) {
        return getWhatsAppUrl(); // WhatsApp service port
      }

      // For production without NEXT_PUBLIC_WEBSOCKET_URL:
      // WebSocket requires SSL when page is HTTPS
      // The WhatsApp API proxy handles HTTP requests but not WebSocket
      // Return the WhatsApp URL for graceful fallback (will fail but error handled)
      return getWhatsAppUrl();
    }

    return getWhatsAppUrl(); // Default fallback
  }, []);

  const handleConnectionEstablished = useCallback((data: any) => {
    console.log("🔌 Socket.IO connection established:", data);
    setConnected(true);
    setConnecting(false);
    setError(null);
    reconnectAttemptsRef.current = 0;

    // Request current state when connected
    console.log("📊 Requesting current sessions state from server...");
    socketRef.current?.emit("sessions:get_current_state");
  }, []);

  const handleCurrentState = useCallback(
    (data: { sessions: WhatsAppSession[]; timestamp: string }) => {
      console.log("📊 Received current sessions state:", data);
      setSessions(data.sessions);
    },
    [],
  );

  const handleStatusChanged = useCallback(
    (data: {
      sessionId: string;
      status: string;
      phoneNumber?: string;
      qrCode?: string;
      timestamp: string;
    }) => {
      console.log("🔄 Session status changed:", data);

      setSessions((current) => {
        const updated = current.map((session) => {
          if (session.id === data.sessionId) {
            return {
              ...session,
              status: data.status as WhatsAppSession["status"],
              phoneNumber: data.phoneNumber || session.phoneNumber,
              qrCode: data.qrCode || session.qrCode,
              timestamp: data.timestamp,
            };
          }
          return session;
        });

        // If session doesn't exist, add it
        if (!updated.find((s) => s.id === data.sessionId)) {
          updated.push({
            id: data.sessionId,
            name: data.sessionId,
            status: data.status as WhatsAppSession["status"],
            phoneNumber: data.phoneNumber,
            qrCode: data.qrCode,
            timestamp: data.timestamp,
          });
        }

        return updated;
      });
    },
    [],
  );

  const handleQRUpdated = useCallback(
    (data: { sessionId: string; qrCode: string; timestamp: string }) => {
      console.log("📱 QR code updated for session:", data.sessionId);

      setSessions((current) => {
        const updated = current.map((session) =>
          session.id === data.sessionId
            ? {
                ...session,
                qrCode: data.qrCode,
                status: "QR_PENDING" as const,
                timestamp: data.timestamp,
              }
            : session,
        );

        // If session doesn't exist, add it (upsert)
        if (!updated.find((s) => s.id === data.sessionId)) {
          updated.push({
            id: data.sessionId,
            name: data.sessionId,
            status: "QR_PENDING" as const,
            qrCode: data.qrCode,
            timestamp: data.timestamp,
          });
        }

        return updated;
      });
    },
    [],
  );

  const handleSessionConnected = useCallback(
    (data: { sessionId: string; phoneNumber: string; timestamp: string }) => {
      console.log("✅ Session connected:", data);

      setSessions((current) => {
        const updated = current.map((session) =>
          session.id === data.sessionId
            ? {
                ...session,
                status: "CONNECTED" as const,
                phoneNumber: data.phoneNumber,
                qrCode: undefined, // Clear QR code when connected
                timestamp: data.timestamp,
              }
            : session,
        );

        // If session doesn't exist, add it (upsert)
        if (!updated.find((s) => s.id === data.sessionId)) {
          updated.push({
            id: data.sessionId,
            name: data.sessionId,
            status: "CONNECTED" as const,
            phoneNumber: data.phoneNumber,
            timestamp: data.timestamp,
          });
        }

        return updated;
      });
    },
    [],
  );

  const handleSessionDisconnected = useCallback(
    (data: { sessionId: string; reason?: string; timestamp: string }) => {
      console.log("❌ Session disconnected:", data);

      setSessions((current) =>
        current.map((session) =>
          session.id === data.sessionId
            ? {
                ...session,
                status: "DISCONNECTED" as const,
                timestamp: data.timestamp,
              }
            : session,
        ),
      );
    },
    [],
  );

  const handleError = useCallback(
    (data: { message: string; timestamp: string }) => {
      console.error("❌ Socket error:", data);
      setError(data.message);
    },
    [],
  );

  const handleServerShutdown = useCallback(
    (data: { message: string; timestamp: string }) => {
      console.warn("🔄 Server shutdown:", data);
      setError("Server is restarting, reconnecting automatically...");
    },
    [],
  );

  const connect = useCallback(() => {
    if (socketRef.current?.connected) {
      console.log("Socket already connected");
      return;
    }

    setConnecting(true);
    setError(null);

    try {
      const socketUrl = getSocketUrl();
      console.log("🔌 Connecting to WebSocket:", socketUrl);

      const newSocket = io(`${socketUrl}/whatsapp-sessions`, {
        path: "/whatsapp-socket/",
        transports: ["websocket", "polling"],
        reconnection,
        reconnectionAttempts,
        reconnectionDelay,
        forceNew: true, // Force new connection
        timeout: 10000,
      });

      // Set up event handlers
      newSocket.on("connect", () => {
        console.log("🔌 Socket connected with ID:", newSocket.id);
        setConnected(true);
        setConnecting(false);
        setError(null);
        reconnectAttemptsRef.current = 0;
      });

      newSocket.on("disconnect", (reason) => {
        console.log("🔌 Socket disconnected:", reason);
        setConnected(false);
        setConnecting(false);

        if (reason === "io server disconnect") {
          // Server disconnected, try to reconnect
          setError("Server disconnected, attempting to reconnect...");
        }
      });

      newSocket.on("connect_error", (error) => {
        console.error("🔌 Socket connection error:", error);
        setConnecting(false);
        setConnected(false);
        setError(`Connection failed: ${error.message}`);

        reconnectAttemptsRef.current++;
        if (reconnectAttemptsRef.current >= reconnectionAttempts) {
          setError("Failed to connect after multiple attempts");
        }
      });

      newSocket.on("reconnect", (attemptNumber) => {
        console.log(`🔌 Socket reconnected after ${attemptNumber} attempts`);
        setError(null);
        reconnectAttemptsRef.current = 0;
      });

      newSocket.on("reconnect_error", (error) => {
        console.error("🔌 Socket reconnection error:", error);
        setError(`Reconnection failed: ${error.message}`);
      });

      // Set up custom event handlers
      newSocket.on("connection:established", handleConnectionEstablished);
      newSocket.on("sessions:current_state", handleCurrentState);
      newSocket.on("session:status_changed", handleStatusChanged);
      newSocket.on("session:qr_updated", handleQRUpdated);
      newSocket.on("session:connected", handleSessionConnected);
      newSocket.on("session:disconnected", handleSessionDisconnected);
      newSocket.on("error", handleError);
      newSocket.on("server:shutdown", handleServerShutdown);

      socketRef.current = newSocket;
      setSocket(newSocket);
    } catch (error) {
      console.error("🔌 Error creating socket:", error);
      setConnecting(false);
      setError(
        `Failed to initialize connection: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }, [
    getSocketUrl,
    reconnection,
    reconnectionAttempts,
    reconnectionDelay,
    handleConnectionEstablished,
    handleCurrentState,
    handleStatusChanged,
    handleQRUpdated,
    handleSessionConnected,
    handleSessionDisconnected,
    handleError,
    handleServerShutdown,
  ]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      console.log("🔌 Disconnecting socket");
      socketRef.current.disconnect();
      socketRef.current = null;
      setSocket(null);
      setConnected(false);
      setConnecting(false);
      setError(null);
      setSessions([]);
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const emit = useCallback((event: string, data?: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
    } else {
      console.warn("Socket not connected, cannot emit event:", event);
    }
  }, []);

  const on = useCallback(
    <T extends SocketEventName>(event: T, handler: SocketEvents[T]) => {
      if (socketRef.current) {
        socketRef.current.on(event, handler as any);
      }
    },
    [],
  );

  const off = useCallback(
    (event: SocketEventName, handler?: (...args: any[]) => void) => {
      if (socketRef.current) {
        if (handler) {
          socketRef.current.off(event, handler);
        } else {
          socketRef.current.off(event);
        }
      }
    },
    [],
  );

  const getCurrentState = useCallback(() => {
    emit("sessions:get_current_state");
  }, [emit]);

  // Auto-connect on mount if enabled
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect]); // Only depend on autoConnect to avoid reconnecting on every render

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  return {
    socket,
    connected,
    connecting,
    error,
    sessions,
    connect,
    disconnect,
    emit,
    on,
    off,
    getCurrentState,
  };
};

export default useSocket;
