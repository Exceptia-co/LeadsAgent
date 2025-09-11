export class ThinkingServiceError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, any>
  ) {
    super(message);
    this.name = 'ThinkingServiceError';
  }
}

export class IntentAnalysisError extends ThinkingServiceError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'INTENT_ANALYSIS_ERROR', context);
    this.name = 'IntentAnalysisError';
  }
}

export class ContextEnrichmentError extends ThinkingServiceError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'CONTEXT_ENRICHMENT_ERROR', context);
    this.name = 'ContextEnrichmentError';
  }
}

export class KnowledgeRetrievalError extends ThinkingServiceError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'KNOWLEDGE_RETRIEVAL_ERROR', context);
    this.name = 'KnowledgeRetrievalError';
  }
}

export class ResponseGenerationError extends ThinkingServiceError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'RESPONSE_GENERATION_ERROR', context);
    this.name = 'ResponseGenerationError';
  }
}

export class CacheError extends ThinkingServiceError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'CACHE_ERROR', context);
    this.name = 'CacheError';
  }
}

export class DecisionEngineError extends ThinkingServiceError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'DECISION_ENGINE_ERROR', context);
    this.name = 'DecisionEngineError';
  }
}

export const ErrorCodes = {
  INTENT_ANALYSIS_ERROR: 'INTENT_ANALYSIS_ERROR',
  CONTEXT_ENRICHMENT_ERROR: 'CONTEXT_ENRICHMENT_ERROR',
  KNOWLEDGE_RETRIEVAL_ERROR: 'KNOWLEDGE_RETRIEVAL_ERROR',
  RESPONSE_GENERATION_ERROR: 'RESPONSE_GENERATION_ERROR',
  CACHE_ERROR: 'CACHE_ERROR',
  DECISION_ENGINE_ERROR: 'DECISION_ENGINE_ERROR',
} as const;
