import { SWRConfiguration } from "swr";

// Smart refresh intervals based on data criticality and user activity
export const REFRESH_INTERVALS = {
  // Critical real-time data (e.g., live chat, notifications)
  CRITICAL: 15000, // 15 seconds

  // Important frequently-changing data (e.g., lead stats)
  IMPORTANT: 120000, // 2 minutes - much more reasonable!

  // Standard data updates (e.g., lead lists)
  STANDARD: 300000, // 5 minutes

  // Low priority data (e.g., user settings)
  LOW: 900000, // 15 minutes

  // Manual refresh only
  MANUAL: 0,
} as const;

// User activity tracking for dynamic refresh rates
let lastUserActivity = Date.now();

// Track user activity
if (typeof window !== "undefined") {
  const updateActivity = () => {
    lastUserActivity = Date.now();
    localStorage.setItem("lastUserActivity", lastUserActivity.toString());
  };

  // Listen for user interactions
  ["mousedown", "keydown", "scroll", "touchstart"].forEach((event) => {
    document.addEventListener(event, updateActivity, { passive: true });
  });
}

// Dynamic refresh interval based on user activity
export const getDynamicInterval = (baseInterval: number): number => {
  if (baseInterval === 0) return 0; // Manual refresh only

  const timeSinceActivity = Date.now() - lastUserActivity;

  // User has been inactive for >15 minutes - disable auto refresh
  if (timeSinceActivity > 15 * 60 * 1000) {
    return 0;
  }

  // User inactive for >10 minutes - very slow refresh
  if (timeSinceActivity > 10 * 60 * 1000) {
    return Math.min(baseInterval * 6, 30 * 60 * 1000); // Max 30 min
  }

  // User inactive for >5 minutes - slower refresh
  if (timeSinceActivity > 5 * 60 * 1000) {
    return baseInterval * 3;
  }

  // User active - normal interval
  return baseInterval;
};

// Optimized global SWR configuration
export const swrConfig: SWRConfiguration = {
  // No global auto-refresh - each hook controls its own timing
  refreshInterval: 0,

  // Smart focus revalidation with throttling
  revalidateOnFocus: true,
  focusThrottleInterval: 60000, // Only check once per minute on focus

  // Revalidate when network connection is restored
  revalidateOnReconnect: true,

  // Conservative retry strategy
  errorRetryCount: 2,
  errorRetryInterval: 10000, // Wait longer between retries

  // Longer dedup interval to reduce requests
  dedupingInterval: 5000,

  // Only revalidate if data is actually stale
  revalidateIfStale: true,

  // Don't refresh on mount if we have fresh data
  revalidateOnMount: false,

  // Reasonable loading timeout
  loadingTimeout: 3000,
};

// Helper function to create cache keys
export const createCacheKey = (
  endpoint: string,
  params?: Record<string, any>,
) => {
  if (!params) return endpoint;

  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      // Properly serialize values to prevent [object Object]
      let serializedValue: string;

      if (typeof value === "object") {
        // If it's an object, stringify it properly or skip if it's a complex object
        if (Array.isArray(value)) {
          serializedValue = value.join(",");
        } else {
          console.warn(
            `Skipping object parameter '${key}' in createCacheKey:`,
            value,
          );
          return; // Skip object parameters to prevent [object Object]
        }
      } else {
        serializedValue = String(value);
      }

      searchParams.set(key, serializedValue);
    }
  });

  const queryString = searchParams.toString();
  return queryString ? `${endpoint}?${queryString}` : endpoint;
};

// Cache keys for different data types
export const CACHE_KEYS = {
  LEADS: "/public/leads",
  LEAD_STATS: "/public/leads/stats",
  WHATSAPP_STATS: "/whatsapp/stats",
} as const;

// Global fetcher function with error handling
export const globalFetcher = async (url: string) => {
  // Use NEXT_PUBLIC_API_URL for client-side requests
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';
  const fullUrl = `${API_BASE_URL}${url}`;

  const response = await fetch(fullUrl, {
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });

  if (!response.ok) {
    // Create detailed error information
    const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
    (error as any).status = response.status;
    (error as any).statusText = response.statusText;
    throw error;
  }

  return response.json();
};

// Global error handler
export const globalErrorHandler = (error: any) => {
  console.error("SWR Error:", error);

  // You can add toast notifications here if needed
  if (error.status === 503) {
    console.warn("Backend service unavailable");
  } else if (error.status >= 500) {
    console.error("Server error occurred");
  }
};

// Global success handler
export const globalSuccessHandler = (data: any, key: string) => {
  console.log(`✅ Data refreshed for ${key}:`, {
    timestamp: new Date().toISOString(),
    dataPreview: typeof data === "object" ? Object.keys(data) : typeof data,
  });
};
