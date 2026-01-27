"use client";

import { useState, useEffect } from "react";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { getWhatsAppUrl } from "../hooks/use-whatsapp-url";
import {
  MessageSquare,
  Search,
  Filter,
  Clock,
  Bot,
  Phone,
  TrendingUp,
  Users,
  Activity,
  RefreshCw,
} from "lucide-react";

interface Conversation {
  id: string;
  leadId: string | null;
  lead: {
    id: string;
    name: string;
    phone: string;
    status: string;
  };
  lastMessage: {
    id: string;
    content: string;
    direction: "INBOUND" | "OUTBOUND";
    messageType: string;
    status: string;
    createdAt: string;
  };
  unreadCount: number;
  updatedAt: string;
}

interface ConversationStats {
  totalConversations: number;
  uniqueContacts: number;
  aiResponses: number;
  averageTokens: number;
}

export default function WhatsAppConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [stats, setStats] = useState<ConversationStats>({
    totalConversations: 0,
    uniqueContacts: 0,
    aiResponses: 0,
    averageTokens: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchConversations();
    fetchStats();
  }, []);

  const fetchConversations = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch(`${getWhatsAppUrl()}/api/conversations`);

      if (!response.ok) {
        throw new Error(`Error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      setConversations(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
      console.error("Error fetching conversations:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch(`${getWhatsAppUrl()}/api/stats`);
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (err) {
      console.warn("Could not fetch conversation stats:", err);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const refreshData = () => {
    fetchConversations();
    fetchStats();
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            Conversaciones
          </h3>
          <div className="animate-spin h-4 w-4">
            <RefreshCw className="h-4 w-4" />
          </div>
        </div>
        <div className="animate-pulse space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-200 rounded-lg"></div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            Conversaciones
          </h3>
          <button
            onClick={refreshData}
            className="p-2 text-gray-400 hover:text-gray-600"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
        <Card className="p-4">
          <div className="text-center">
            <div className="text-red-500 mb-2">
              <MessageSquare className="h-8 w-8 mx-auto" />
            </div>
            <h4 className="text-sm font-medium text-gray-900 mb-1">
              Error al cargar conversaciones
            </h4>
            <p className="text-sm text-gray-500 mb-4">{error}</p>
            <button
              onClick={refreshData}
              className="inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Reintentar
            </button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Conversaciones</h3>
        <button
          onClick={refreshData}
          className="p-2 text-gray-400 hover:text-gray-600"
          title="Actualizar"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-3">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <MessageSquare className="h-6 w-6 text-green-500" />
            </div>
            <div className="ml-3">
              <p className="text-xs font-medium text-gray-500">Mensajes</p>
              <p className="text-lg font-semibold text-gray-900">
                {stats.totalConversations}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-3">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Users className="h-6 w-6 text-green-500" />
            </div>
            <div className="ml-3">
              <p className="text-xs font-medium text-gray-500">Contactos</p>
              <p className="text-lg font-semibold text-gray-900">
                {stats.uniqueContacts}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-3">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Bot className="h-6 w-6 text-purple-500" />
            </div>
            <div className="ml-3">
              <p className="text-xs font-medium text-gray-500">IA</p>
              <p className="text-lg font-semibold text-gray-900">
                {stats.aiResponses}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-3">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Activity className="h-6 w-6 text-orange-500" />
            </div>
            <div className="ml-3">
              <p className="text-xs font-medium text-gray-500">Tokens</p>
              <p className="text-lg font-semibold text-gray-900">
                {Math.round(stats.averageTokens)}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Conversations List */}
      {conversations.length === 0 ? (
        <Card className="p-6">
          <div className="text-center">
            <MessageSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h4 className="text-sm font-medium text-gray-900 mb-2">
              No hay conversaciones aún
            </h4>
            <p className="text-sm text-gray-500">
              Las conversaciones aparecerán aquí cuando envíes o recibas
              mensajes de WhatsApp.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {conversations.map((conversation) => (
            <Card
              key={conversation.id}
              className="p-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3 flex-1">
                  <div className="flex-shrink-0">
                    <div className="h-10 w-10 bg-green-100 rounded-full flex items-center justify-center">
                      <Phone className="h-5 w-5 text-green-600" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {conversation.lead.name || "Sin nombre"}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatDate(conversation.lastMessage.createdAt)}
                      </p>
                    </div>
                    <p className="text-xs text-gray-500 mb-1">
                      {conversation.lead.phone}
                    </p>
                    <p className="text-sm text-gray-600 line-clamp-2">
                      {conversation.lastMessage.direction === "INBOUND"
                        ? "📱 "
                        : "💬 "}
                      {conversation.lastMessage.content}
                    </p>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center space-x-2">
                        <Badge
                          variant={
                            conversation.lead.status === "NUEVO"
                              ? "default"
                              : conversation.lead.status === "QUALIFIED"
                                ? "default"
                                : "secondary"
                          }
                          className="text-xs"
                        >
                          {conversation.lead.status}
                        </Badge>
                        {conversation.lastMessage.direction === "OUTBOUND" && (
                          <Badge variant="outline" className="text-xs">
                            <Bot className="h-3 w-3 mr-1" />
                            IA
                          </Badge>
                        )}
                      </div>
                      {conversation.unreadCount > 0 && (
                        <Badge variant="default" className="bg-red-500">
                          {conversation.unreadCount}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
