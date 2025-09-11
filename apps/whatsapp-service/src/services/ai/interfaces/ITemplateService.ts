/**
 * Template Service Interfaces
 * 
 * Defines interfaces for managing predefined response templates.
 */

import { MessageContext, IntentCategory } from './IIntentAnalysis';

/**
 * Template configuration
 */
export interface TemplateConfig {
  maxWords: number;
  enableFallback: boolean;
  priority: 'low' | 'medium' | 'high';
  useRandomSelection: boolean;
}

/**
 * Response template definition
 */
export interface ResponseTemplate {
  id: string;
  category: IntentCategory;
  templates: string[];
  priority: number;
  conditions?: {
    timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
    language?: string;
    userType?: 'new' | 'returning';
  };
  variables?: string[];
}

/**
 * Template selection result
 */
export interface TemplateResult {
  template: string;
  category: IntentCategory;
  templateId: string;
  variables?: Record<string, string>;
}

/**
 * Template service interface
 */
export interface ITemplateService {
  /**
   * Get template for specific intent
   * @param intent - Intent category
   * @param context - Message context
   */
  getTemplate(intent: IntentCategory, context?: MessageContext): string | null;

  /**
   * Check if template should be used instead of AI generation
   * @param intent - Intent category
   * @param confidence - Intent confidence score
   * @param messageLength - Length of original message
   */
  shouldUseTemplate(
    intent: IntentCategory,
    confidence: number,
    messageLength: number
  ): boolean;

  /**
   * Apply template fallback for long AI responses
   * @param originalResponse - Original AI response
   * @param intent - Detected intent
   * @param maxWords - Maximum allowed words
   */
  applyFallback(
    originalResponse: string,
    intent: IntentCategory,
    maxWords?: number
  ): string;

  /**
   * Add or update template
   * @param template - Template definition
   */
  addTemplate(template: ResponseTemplate): void;

  /**
   * Get all templates for a category
   * @param category - Intent category
   */
  getTemplatesForCategory(category: IntentCategory): ResponseTemplate[];

  /**
   * Process template variables
   * @param template - Template string with variables
   * @param context - Message context for variable resolution
   */
  processVariables(template: string, context?: MessageContext): string;
}

/**
 * Template categories with predefined templates
 */
export interface TemplateCategories {
  greeting: string[];
  pricing: string[];
  products: string[];
  registration: string[];
  technical: string[];
  fallback: string[];
}