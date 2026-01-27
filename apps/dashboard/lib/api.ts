import useSWR, { mutate } from "swr";
import { useAuth } from "@clerk/nextjs";
import {
  CACHE_KEYS,
  createCacheKey,
  globalFetcher,
  globalErrorHandler,
  globalSuccessHandler,
  REFRESH_INTERVALS,
  getDynamicInterval,
} from "./swr-config";
import type { Lead } from "../types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";

// Helper para obtener el token de Clerk
const getAuthHeaders = async (getToken?: () => Promise<string | null>) => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (getToken) {
    try {
      const token = await getToken();
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
    } catch (error) {
      console.warn("Error getting auth token:", error);
    }
  }

  return headers;
};

// Configuración del fetcher para SWR
const createFetcher =
  (getToken?: () => Promise<string | null>) => async (url: string) => {
    const headers = await getAuthHeaders(getToken);

    const response = await fetch(`${API_BASE_URL}${url}`, {
      headers,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  };

// Función helper para POST/PUT/PATCH requests
const createMutate =
  (getToken?: () => Promise<string | null>) =>
  async (url: string, options: RequestInit = {}) => {
    const headers = await getAuthHeaders(getToken);

    const response = await fetch(`${API_BASE_URL}${url}`, {
      headers: {
        ...headers,
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  };

// Global refresh function to invalidate all lead-related caches
export const refreshAllLeadData = async () => {
  console.log("🔄 Refreshing all lead data...");

  // Invalidate all lead-related cache entries
  await Promise.all([
    mutate((key) => typeof key === "string" && key.includes(CACHE_KEYS.LEADS)),
    mutate(
      (key) => typeof key === "string" && key.includes(CACHE_KEYS.LEAD_STATS),
    ),
  ]);

  console.log("✅ All lead data refreshed");
};

// Hooks para diferentes endpoints con intervalos inteligentes
export const useLeads = (
  page = 1,
  limit = 20,
  searchTerm?: string,
  sortBy?: string,
  sortOrder?: string,
  options?: {
    refreshInterval?: number;
    priority?: "standard" | "low";
  },
) => {
  const cacheKey = createCacheKey(CACHE_KEYS.LEADS, {
    page,
    limit,
    ...(searchTerm && searchTerm.trim() !== "" && { q: searchTerm }),
    // Ensure sortBy and sortOrder are strings to prevent object serialization
    ...(sortBy && typeof sortBy === "string" && { sortBy }),
    ...(sortOrder && typeof sortOrder === "string" && { sortOrder }),
  });

  // Determine smart refresh interval
  const baseInterval =
    options?.refreshInterval ||
    (options?.priority === "low"
      ? REFRESH_INTERVALS.LOW
      : REFRESH_INTERVALS.STANDARD);

  const smartInterval = getDynamicInterval(baseInterval);

  const {
    data,
    error,
    mutate: refetch,
    isValidating,
  } = useSWR(cacheKey, globalFetcher, {
    // Smart refresh based on user activity
    refreshInterval: smartInterval,

    // Only revalidate on mount if we don't have cached data
    revalidateOnMount: true, // Always revalidate on mount for fresh data

    // More conservative revalidation
    revalidateOnFocus: smartInterval > 0,

    onError: globalErrorHandler,
    onSuccess: (data) => globalSuccessHandler(data, cacheKey),
  });

  return {
    leads: (data?.data || []) as Lead[], // La API devuelve data: [...]
    pagination: data?.meta as
      | {
          page: number;
          limit: number;
          total: number;
          totalPages: number;
          hasNext: boolean;
          hasPrev: boolean;
        }
      | undefined,
    isLoading: !error && !data,
    isError: error,
    isRefreshing: isValidating,
    refetch,
    cacheKey, // Expose for external cache invalidation
    refreshInterval: smartInterval, // Show current refresh rate
  };
};

export const useLeadStats = (options?: {
  refreshInterval?: number;
  priority?: "critical" | "important" | "standard";
}) => {
  const cacheKey = CACHE_KEYS.LEAD_STATS;

  // Stats are more important - shorter refresh intervals
  const baseInterval =
    options?.refreshInterval ||
    (options?.priority === "critical"
      ? REFRESH_INTERVALS.CRITICAL
      : options?.priority === "important"
        ? REFRESH_INTERVALS.IMPORTANT
        : REFRESH_INTERVALS.STANDARD);

  const smartInterval = getDynamicInterval(baseInterval);

  const {
    data,
    error,
    mutate: refetch,
    isValidating,
  } = useSWR(cacheKey, globalFetcher, {
    // Smart refresh based on user activity
    refreshInterval: smartInterval,

    // Stats should refresh on mount to show fresh counts
    revalidateOnMount: true,

    // Always revalidate stats on focus (they're important)
    revalidateOnFocus: true,

    onError: globalErrorHandler,
    onSuccess: (data) => globalSuccessHandler(data, cacheKey),
  });

  return {
    stats: data,
    isLoading: !error && !data,
    isError: error,
    isRefreshing: isValidating,
    refetch,
    cacheKey, // Expose for external cache invalidation
    refreshInterval: smartInterval, // Show current refresh rate
  };
};

export const useLead = (id: string) => {
  const { getToken } = useAuth();
  const fetcher = createFetcher(getToken);

  const {
    data,
    error,
    mutate: refetch,
  } = useSWR(id ? `/leads/${id}` : null, fetcher);

  return {
    lead: data,
    isLoading: !error && !data,
    isError: error,
    refetch,
  };
};

// Custom hook para obtener las funciones de mutación autenticadas
export const useAuthenticatedApi = () => {
  const { getToken } = useAuth();
  const mutateFn = createMutate(getToken);

  return {
    createLead: async (leadData: {
      name: string;
      phone: string;
      status?: string;
    }) => {
      try {
        console.log("🚀 Creating new lead...", { name: leadData.name });

        const result = await mutateFn("/api/public/leads", {
          method: "POST",
          body: JSON.stringify(leadData),
        });

        // Invalidate caches after successful creation
        console.log("✅ Lead created, refreshing caches...");
        await refreshAllLeadData();

        return result;
      } catch (error) {
        console.error("❌ Failed to create lead:", error);
        throw error;
      }
    },

    updateLead: async (id: string, updates: Record<string, any>) => {
      try {
        console.log("🔄 Updating lead...", { id, updates });

        const result = await mutateFn(`/api/public/leads/${id}`, {
          method: "PATCH",
          body: JSON.stringify(updates),
        });

        // Invalidate caches after successful update
        console.log("✅ Lead updated, refreshing caches...");
        await refreshAllLeadData();

        return result;
      } catch (error) {
        console.error("❌ Failed to update lead:", error);
        throw error;
      }
    },

    updateLeadStatus: async (id: string, status: string) => {
      try {
        console.log("🔄 Updating lead status...", { id, status });

        const result = await mutateFn(`/api/public/leads/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ status }),
        });

        // Invalidate caches after successful status update
        console.log("✅ Lead status updated, refreshing caches...");
        await refreshAllLeadData();

        return result;
      } catch (error) {
        console.error("❌ Failed to update lead status:", error);
        throw error;
      }
    },

    deleteLead: async (id: string) => {
      try {
        console.log("🗑️ Deleting lead...", { id });

        const result = await mutateFn(`/api/public/leads/${id}`, {
          method: "DELETE",
        });

        // Invalidate caches after successful deletion
        console.log("✅ Lead deleted, refreshing caches...");
        await refreshAllLeadData();

        return result;
      } catch (error) {
        console.error("❌ Failed to delete lead:", error);
        throw error;
      }
    },

    // Manual refresh function
    refreshAllData: refreshAllLeadData,
  };
};

// Funciones compatibles hacia atrás (deprecadas - usar useAuthenticatedApi)
export const createLead = async (leadData: {
  name: string;
  phone: string;
  status?: string;
}) => {
  console.warn(
    "createLead is deprecated. Use useAuthenticatedApi() hook instead.",
  );
  const mutate = createMutate();
  return mutate("/leads", {
    method: "POST",
    body: JSON.stringify(leadData),
  });
};

export const updateLead = async (id: string, updates: Record<string, any>) => {
  console.warn(
    "updateLead is deprecated. Use useAuthenticatedApi() hook instead.",
  );
  const mutate = createMutate();
  return mutate(`/leads/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
};

export const updateLeadStatus = async (id: string, status: string) => {
  console.warn(
    "updateLeadStatus is deprecated. Use useAuthenticatedApi() hook instead.",
  );
  const mutate = createMutate();
  return mutate(`/leads/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
};

export const deleteLead = async (id: string) => {
  console.warn(
    "deleteLead is deprecated. Use useAuthenticatedApi() hook instead.",
  );
  const mutate = createMutate();
  return mutate(`/leads/${id}`, {
    method: "DELETE",
  });
};

// Export the base functions for custom usage
export { createFetcher, createMutate };
