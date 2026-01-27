// Types for AI Assistant functionality

export interface AIProvider {
  id: "openrouter" | "gemini";
  name: string;
  isActive: boolean;
  isConfigured: boolean;
  description: string;
  models: string[];
}

export interface AIStatus {
  providers?: {
    openrouter?: {
      configured: boolean;
      active: boolean;
      model?: string;
    };
    gemini?: {
      configured: boolean;
      active: boolean;
      model?: string;
    };
  };
  currentProvider?: "openrouter" | "gemini";
  totalRequests?: number;
  totalTokens?: number;
  averageResponseTime?: number;
  errorRate?: number;
}

export interface AITestRequest {
  message: string;
  provider?: "openrouter" | "gemini";
}

export interface AITestResponse {
  success: boolean;
  data?: {
    response: string;
    provider: string;
    model: string;
    tokens?: number;
    responseTime: number;
    timestamp: string;
  };
  error?: string;
}

export interface AIStats {
  totalConversations: number;
  uniqueContacts: number;
  aiResponses: number;
  averageTokens: number;
  providerBreakdown: {
    openrouter: number;
    gemini: number;
  };
  responseTimeAverage: number;
  errorCount: number;
  successRate: number;
}

export interface AITestHistory {
  id: string;
  message: string;
  response: string;
  provider: "openrouter" | "gemini";
  model: string;
  tokens: number;
  responseTime: number;
  timestamp: string;
  success: boolean;
  error?: string;
}

export interface AIAutomationConfig {
  enabled: boolean;
  autoReply: boolean;
  whitelistOnly: boolean;
  responseDelay: number; // seconds
  maxTokensPerResponse: number;
  rateLimitPerHour: number;
}
