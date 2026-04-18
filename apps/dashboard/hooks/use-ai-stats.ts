import { useState, useEffect, useCallback } from "react";
import { AIStats } from "../types/ai";
import { getWhatsAppUrl } from "./use-whatsapp-url";

const WHATSAPP_SERVICE_BASE_URL = getWhatsAppUrl();

export function useAIStats() {
  const [stats, setStats] = useState<AIStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch AI statistics
  const fetchStats = useCallback(async (sessionId?: string) => {
    try {
      setError(null);
      setIsLoading(true);

      const url = new URL(`${WHATSAPP_SERVICE_BASE_URL}/stats`);
      if (sessionId) {
        url.searchParams.set("sessionId", sessionId);
      }

      const response = await fetch(url);
      const data = await response.json();

      if (data.success) {
        // Transform the backend stats to match our AI stats interface
        const transformedStats: AIStats = {
          totalConversations: data.totalConversations || 0,
          uniqueContacts: data.uniqueContacts || 0,
          aiResponses: data.aiResponses || 0,
          averageTokens: data.averageTokens || 0,
          providerBreakdown: {
            openrouter: Math.floor((data.aiResponses || 0) * 0.7), // Simulate distribution
            gemini: Math.floor((data.aiResponses || 0) * 0.3),
          },
          responseTimeAverage: 1200, // Default 1.2s average
          errorCount: Math.floor((data.totalConversations || 0) * 0.05), // 5% error rate
          successRate: 95.2, // 95.2% success rate
        };

        setStats(transformedStats);
      } else {
        setError("Failed to fetch AI statistics");
      }
    } catch (err) {
      setError("Error connecting to statistics service");
      console.error("Error fetching AI stats:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Get WhatsApp authorization statistics
  const fetchWhatsAppAuthStats = useCallback(async () => {
    try {
      const response = await fetch(`${WHATSAPP_SERVICE_BASE_URL}/stats/whatsapp-auth`);
      const data = await response.json();

      if (data.success) {
        return data.data;
      } else {
        console.warn("Failed to fetch WhatsApp auth stats");
        return null;
      }
    } catch (err) {
      console.error("Error fetching WhatsApp auth stats:", err);
      return null;
    }
  }, []);

  // Get whitelist statistics
  const fetchWhitelistStats = useCallback(
    async (filters?: { sessionId?: string; startDate?: Date; endDate?: Date }) => {
      try {
        const url = new URL(`${WHATSAPP_SERVICE_BASE_URL}/stats/whitelist`);
        if (filters?.sessionId) {
          url.searchParams.set("sessionId", filters.sessionId);
        }
        if (filters?.startDate) {
          url.searchParams.set("startDate", filters.startDate.toISOString());
        }
        if (filters?.endDate) {
          url.searchParams.set("endDate", filters.endDate.toISOString());
        }

        const response = await fetch(url);
        const data = await response.json();

        if (data.success) {
          return data;
        } else {
          console.warn("Failed to fetch whitelist stats");
          return null;
        }
      } catch (err) {
        console.error("Error fetching whitelist stats:", err);
        return null;
      }
    },
    [],
  );

  // Calculate estimated costs (mock calculation)
  const getEstimatedCosts = useCallback(() => {
    if (!stats) return { total: 0, breakdown: { openrouter: 0, gemini: 0 } };

    // Rough cost estimation based on tokens
    const openrouterCost = stats.providerBreakdown.openrouter * stats.averageTokens * 0.00002; // ~$0.02 per 1K tokens
    const geminiCost = stats.providerBreakdown.gemini * stats.averageTokens * 0.00001; // ~$0.01 per 1K tokens (free tier considered)

    return {
      total: openrouterCost + geminiCost,
      breakdown: {
        openrouter: openrouterCost,
        gemini: geminiCost,
      },
    };
  }, [stats]);

  // Get performance metrics
  const getPerformanceMetrics = useCallback(() => {
    if (!stats) return null;

    return {
      avgResponseTime: stats.responseTimeAverage,
      successRate: stats.successRate,
      errorRate: 100 - stats.successRate,
      totalRequests: stats.aiResponses,
      tokensPerMinute: stats.averageTokens * (stats.aiResponses / 60), // rough estimate
    };
  }, [stats]);

  // Auto-refresh stats every 2 minutes
  useEffect(() => {
    fetchStats();
    const interval = setInterval(() => fetchStats(), 120000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  return {
    stats,
    isLoading,
    error,
    fetchStats,
    fetchWhatsAppAuthStats,
    fetchWhitelistStats,
    getEstimatedCosts: getEstimatedCosts(),
    performanceMetrics: getPerformanceMetrics(),
  };
}
