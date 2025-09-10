/**
 * DecisionEngine - AI Thinking Service Module
 *
 * Core decision-making engine that determines whether to respond automatically
 * or escalate to human agents. Implements sophisticated logic for response
 * validation, confidence thresholds, and risk assessment.
 *
 * Part of Phase 3: AI Services Modularization
 */

import { logger } from '../../utils/logger';
import { IntentAnalysisExtended, EnrichedContext } from './ContextEnricher';
import { KnowledgeSearchResult } from './KnowledgeRetrieval';
import { StrategyAnalysis } from './StrategySelector';

// ============================================
// INTERFACES Y TIPOS
// ============================================

export interface DecisionResult {
  shouldRespond: boolean;
  confidence: number;
  reasoning: string;
  factors: DecisionFactor[];
  riskAssessment: RiskAssessment;
  alternativeActions: string[];
  timeToDecision: number;
}

export interface DecisionFactor {
  name: string;
  value: any;
  weight: number;
  impact: 'positive' | 'negative' | 'neutral' | 'critical';
  category: 'intent' | 'knowledge' | 'strategy' | 'context' | 'risk';
  description: string;
}

export interface RiskAssessment {
  level: 'low' | 'medium' | 'high' | 'critical';
  factors: string[];
  mitigation: string[];
  escalationRequired: boolean;
}

export interface DecisionRules {
  minimumConfidence: number;
  requireKnowledge: boolean;
  allowGreetingsBypass: boolean;
  escalateOnNegativeSentiment: boolean;
  escalateOnHighUrgency: boolean;
  maxConversationLength: number;
  riskToleranceLevel: 'low' | 'medium' | 'high';
}

export interface ThinkingStep {
  step: number;
  type: 'analysis' | 'reasoning' | 'knowledge_retrieval' | 'decision' | 'validation';
  title: string;
  content: string;
  confidence: number;
  data?: any;
}

// ============================================
// DECISION ENGINE CLASS
// ============================================

export class DecisionEngine {
  private decisionHistory: Map<string, DecisionResult[]> = new Map();
  private readonly DEFAULT_RULES: DecisionRules = {
    minimumConfidence: 0.4,
    requireKnowledge: true,
    allowGreetingsBypass: true,
    escalateOnNegativeSentiment: false,
    escalateOnHighUrgency: false,
    maxConversationLength: 20,
    riskToleranceLevel: 'medium',
  };

  constructor() {
    logger.debug('DecisionEngine module initialized');
  }

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /**
   * Make final decision on whether to respond automatically
   */
  public async makeFinalDecision(
    _steps: ThinkingStep[],
    context: EnrichedContext,
    intentAnalysis: IntentAnalysisExtended,
    knowledgeResult: KnowledgeSearchResult,
    strategyAnalysis: StrategyAnalysis
  ): Promise<DecisionResult> {
    const startTime = Date.now();

    try {
      logger.debug('Starting decision process:', {
        intent: intentAnalysis.intent,
        knowledgeItems: knowledgeResult.items.length,
        strategyType: strategyAnalysis.strategy.type,
      });

      // Initialize decision factors
      const factors: DecisionFactor[] = [];
      let shouldRespond = true; // Default to respond
      const alternativeActions: string[] = [];

      // 1. PRIORITY CHECK: Handle greetings first (bypass most rules)
      const greetingDecision = await this.handleGreetingDecision(context, factors);
      if (greetingDecision !== null) {
        return this.buildDecisionResult(
          greetingDecision,
          0.95,
          'Greeting detected: automatic response guaranteed',
          factors,
          { level: 'low', factors: [], mitigation: [], escalationRequired: false },
          alternativeActions,
          Date.now() - startTime
        );
      }

      // 2. Get decision rules
      const rules = await this.getDecisionRules();

      // 3. Evaluate intent confidence
      const intentDecision = this.evaluateIntentConfidence(intentAnalysis, rules, factors);
      if (!intentDecision.shouldRespond) {
        shouldRespond = false;
        alternativeActions.push('Request clarification', 'Escalate to human');
      }

      // 4. Evaluate knowledge availability
      const knowledgeDecision = this.evaluateKnowledgeAvailability(knowledgeResult, rules, factors);
      if (
        !knowledgeDecision.shouldRespond &&
        !this.isGreetingBypassAllowed(intentAnalysis, rules)
      ) {
        shouldRespond = false;
        alternativeActions.push('Search for more knowledge', 'Defer to human expert');
      }

      // 5. Evaluate strategy viability
      const strategyDecision = this.evaluateStrategyViability(strategyAnalysis, factors);
      if (!strategyDecision.shouldRespond) {
        shouldRespond = false;
        alternativeActions.push('Try alternative strategy', 'Escalate to supervisor');
      }

      // 6. Evaluate context factors
      const contextDecision = this.evaluateContextFactors(context, rules, factors);
      if (!contextDecision.shouldRespond) {
        shouldRespond = false;
        alternativeActions.push('Wait for better context', 'Request more information');
      }

      // 7. Perform risk assessment
      const riskAssessment = this.performRiskAssessment(
        intentAnalysis,
        knowledgeResult,
        strategyAnalysis,
        context,
        rules
      );

      // 8. Apply risk-based overrides
      if (riskAssessment.escalationRequired) {
        shouldRespond = false;
        alternativeActions.push('Immediate escalation required', 'Risk mitigation protocol');
      }

      // 9. Calculate overall confidence
      const overallConfidence = this.calculateOverallConfidence(
        factors,
        intentAnalysis,
        knowledgeResult,
        strategyAnalysis
      );

      // 10. Generate final reasoning
      const reasoning = this.generateDecisionReasoning(factors, shouldRespond, riskAssessment);

      // 11. Store decision for learning
      await this.storeDecisionHistory(context.phoneNumber || 'unknown', {
        shouldRespond,
        confidence: overallConfidence,
        reasoning,
        factors,
        riskAssessment,
        alternativeActions,
        timeToDecision: Date.now() - startTime,
      });

      return this.buildDecisionResult(
        shouldRespond,
        overallConfidence,
        reasoning,
        factors,
        riskAssessment,
        alternativeActions,
        Date.now() - startTime
      );
    } catch (error) {
      logger.error('Error in decision engine:', error);

      // Fallback to safe decision (don't respond)
      return this.buildDecisionResult(
        false,
        0.1,
        'Error in decision process, defaulting to safe option',
        [
          {
            name: 'decision_error',
            value: error instanceof Error ? error.message : 'Unknown error',
            weight: 1.0,
            impact: 'critical',
            category: 'risk',
            description: 'Critical error in decision process',
          },
        ],
        {
          level: 'critical',
          factors: ['Decision engine error'],
          mitigation: ['Manual review required'],
          escalationRequired: true,
        },
        ['Immediate human intervention'],
        Date.now() - startTime
      );
    }
  }

  /**
   * Calculate overall confidence for the thinking process
   */
  public calculateOverallConfidence(
    factors: DecisionFactor[],
    intentAnalysis: IntentAnalysisExtended,
    knowledgeResult: KnowledgeSearchResult,
    strategyAnalysis: StrategyAnalysis
  ): number {
    // Base confidence from intent analysis
    let confidence = intentAnalysis.confidence * 0.3;

    // Add knowledge contribution
    confidence += knowledgeResult.confidence * 0.25;

    // Add strategy contribution
    confidence += strategyAnalysis.confidence * 0.25;

    // Add factor-based adjustments
    const factorContribution = factors.reduce((sum, factor) => {
      const impact =
        factor.impact === 'positive'
          ? 0.1
          : factor.impact === 'negative'
            ? -0.1
            : factor.impact === 'critical'
              ? -0.3
              : 0;
      return sum + impact * factor.weight;
    }, 0);

    confidence += factorContribution * 0.2;

    // Ensure confidence is within bounds
    return Math.max(0.1, Math.min(0.95, confidence));
  }

  /**
   * Generate reasoning explanation from factors
   */
  public generateDecisionReasoning(
    factors: DecisionFactor[],
    shouldRespond: boolean,
    riskAssessment: RiskAssessment
  ): string {
    const decision = shouldRespond ? 'RESPOND' : 'DO NOT RESPOND';
    const keyFactors = factors
      .filter(f => f.impact === 'positive' || f.impact === 'critical')
      .slice(0, 3)
      .map(f => f.description);

    let reasoning = `Decision: ${decision}. `;

    if (keyFactors.length > 0) {
      reasoning += `Key factors: ${keyFactors.join(', ')}. `;
    }

    if (riskAssessment.level !== 'low') {
      reasoning += `Risk level: ${riskAssessment.level}. `;
    }

    return reasoning;
  }

  // ============================================
  // PRIVATE DECISION METHODS
  // ============================================

  /**
   * Handle greeting decision with special bypass logic
   */
  private async handleGreetingDecision(
    context: EnrichedContext,
    factors: DecisionFactor[]
  ): Promise<boolean | null> {
    try {
      const isGreeting = await this.isGreetingMessage(context.messageText || '');

      if (isGreeting) {
        factors.push({
          name: 'greeting_detected',
          value: true,
          weight: 1.0,
          impact: 'positive',
          category: 'intent',
          description: 'Greeting message detected, automatic response guaranteed',
        });

        return true;
      }

      return null;
    } catch (error) {
      logger.error('Error in greeting decision:', error);
      return null;
    }
  }

  /**
   * Evaluate intent confidence against rules
   */
  private evaluateIntentConfidence(
    intentAnalysis: IntentAnalysisExtended,
    rules: DecisionRules,
    factors: DecisionFactor[]
  ): { shouldRespond: boolean } {
    const meetsThreshold = intentAnalysis.confidence >= rules.minimumConfidence;

    factors.push({
      name: 'intent_confidence',
      value: intentAnalysis.confidence,
      weight: 0.8,
      impact: meetsThreshold ? 'positive' : 'negative',
      category: 'intent',
      description: `Intent confidence ${(intentAnalysis.confidence * 100).toFixed(1)}% ${meetsThreshold ? 'meets' : 'below'} threshold`,
    });

    return { shouldRespond: meetsThreshold };
  }

  /**
   * Evaluate knowledge availability against rules
   */
  private evaluateKnowledgeAvailability(
    knowledgeResult: KnowledgeSearchResult,
    rules: DecisionRules,
    factors: DecisionFactor[]
  ): { shouldRespond: boolean } {
    const hasKnowledge = knowledgeResult.items.length > 0;
    const shouldRespond = !rules.requireKnowledge || hasKnowledge;

    factors.push({
      name: 'knowledge_availability',
      value: knowledgeResult.items.length,
      weight: 0.7,
      impact: hasKnowledge ? 'positive' : 'negative',
      category: 'knowledge',
      description: `${knowledgeResult.items.length} knowledge items found${hasKnowledge ? ', sufficient for response' : ', insufficient for response'}`,
    });

    return { shouldRespond };
  }

  /**
   * Evaluate strategy viability
   */
  private evaluateStrategyViability(
    strategyAnalysis: StrategyAnalysis,
    factors: DecisionFactor[]
  ): { shouldRespond: boolean } {
    const isEscalationStrategy = strategyAnalysis.strategy.type === 'escalate';
    const isDeferStrategy = strategyAnalysis.strategy.type === 'defer';
    const shouldRespond = !isEscalationStrategy && !isDeferStrategy;

    if (isEscalationStrategy) {
      factors.push({
        name: 'escalation_strategy',
        value: strategyAnalysis.strategy.type,
        weight: 1.0,
        impact: 'critical',
        category: 'strategy',
        description: 'Strategy requires escalation to human agent',
      });
    } else if (isDeferStrategy) {
      factors.push({
        name: 'defer_strategy',
        value: strategyAnalysis.strategy.type,
        weight: 0.8,
        impact: 'negative',
        category: 'strategy',
        description: 'Strategy recommends deferring to human',
      });
    } else {
      factors.push({
        name: 'viable_strategy',
        value: strategyAnalysis.strategy.type,
        weight: 0.6,
        impact: 'positive',
        category: 'strategy',
        description: `Viable ${strategyAnalysis.strategy.type} strategy identified`,
      });
    }

    return { shouldRespond };
  }

  /**
   * Evaluate context factors for decision
   */
  private evaluateContextFactors(
    context: EnrichedContext,
    rules: DecisionRules,
    factors: DecisionFactor[]
  ): { shouldRespond: boolean } {
    let shouldRespond = true;

    // Check conversation length
    const conversationLength = context.messageHistory?.length || 0;
    if (conversationLength > rules.maxConversationLength) {
      shouldRespond = false;
      factors.push({
        name: 'long_conversation',
        value: conversationLength,
        weight: 0.5,
        impact: 'negative',
        category: 'context',
        description: `Conversation too long (${conversationLength} messages), consider human handoff`,
      });
    }

    // Check engagement level
    if (context.userEngagementLevel === 'low') {
      factors.push({
        name: 'low_engagement',
        value: context.userEngagementLevel,
        weight: 0.3,
        impact: 'neutral',
        category: 'context',
        description: 'Low user engagement detected',
      });
    } else if (context.userEngagementLevel === 'high') {
      factors.push({
        name: 'high_engagement',
        value: context.userEngagementLevel,
        weight: 0.4,
        impact: 'positive',
        category: 'context',
        description: 'High user engagement, good for automated response',
      });
    }

    return { shouldRespond };
  }

  /**
   * Perform comprehensive risk assessment
   */
  private performRiskAssessment(
    intentAnalysis: IntentAnalysisExtended,
    knowledgeResult: KnowledgeSearchResult,
    strategyAnalysis: StrategyAnalysis,
    _context: EnrichedContext,
    rules: DecisionRules
  ): RiskAssessment {
    const risks: string[] = [];
    const mitigation: string[] = [];
    let level: RiskAssessment['level'] = 'low';
    let escalationRequired = false;

    // High urgency risk
    if (intentAnalysis.urgency === 'high' && rules.escalateOnHighUrgency) {
      risks.push('High urgency message detected');
      mitigation.push('Prioritize human response');
      level = 'high';
      escalationRequired = true;
    }

    // Negative sentiment risk
    if (intentAnalysis.sentiment === 'negative' && rules.escalateOnNegativeSentiment) {
      risks.push('Negative sentiment detected');
      mitigation.push('Use supportive tone, consider escalation');
      if (level === 'low') level = 'medium';
    }

    // Low confidence risk
    if (intentAnalysis.confidence < 0.3) {
      risks.push('Very low intent confidence');
      mitigation.push('Request clarification before responding');
      if (level === 'low') level = 'medium';
    }

    // No knowledge risk
    if (knowledgeResult.items.length === 0 && intentAnalysis.category !== 'social') {
      risks.push('No relevant knowledge available');
      mitigation.push('Defer to human expert');
      if (level === 'low') level = 'medium';
    }

    // Strategy escalation risk
    if (strategyAnalysis.strategy.type === 'escalate') {
      risks.push('Strategy requires escalation');
      mitigation.push('Immediate human handoff');
      level = 'high';
      escalationRequired = true;
    }

    return {
      level,
      factors: risks,
      mitigation,
      escalationRequired,
    };
  }

  /**
   * Check if greeting bypass is allowed
   */
  private isGreetingBypassAllowed(
    intentAnalysis: IntentAnalysisExtended,
    rules: DecisionRules
  ): boolean {
    return (
      rules.allowGreetingsBypass &&
      (intentAnalysis.intent === 'greeting' || intentAnalysis.intent === 'saludo')
    );
  }

  /**
   * Get decision rules from configuration or defaults
   */
  private async getDecisionRules(): Promise<DecisionRules> {
    try {
      // In future implementation, load from database configuration
      return this.DEFAULT_RULES;
    } catch (error) {
      logger.error('Error loading decision rules, using defaults:', error);
      return this.DEFAULT_RULES;
    }
  }

  /**
   * Check if message is a greeting
   */
  private async isGreetingMessage(message: string): Promise<boolean> {
    const greetingKeywords = [
      'hola',
      'hi',
      'buenas',
      'buenos',
      'saludos',
      'hey',
      'hello',
      'que tal',
    ];
    const normalizedMessage = message.toLowerCase().trim();

    // Exact match
    if (greetingKeywords.some(keyword => normalizedMessage === keyword)) {
      return true;
    }

    // Short greeting
    if (normalizedMessage.length <= 20) {
      return greetingKeywords.some(keyword => normalizedMessage.startsWith(keyword));
    }

    return false;
  }

  /**
   * Store decision for historical analysis
   */
  private async storeDecisionHistory(phoneNumber: string, decision: DecisionResult): Promise<void> {
    try {
      const history = this.decisionHistory.get(phoneNumber) || [];
      history.push(decision);

      // Keep only last 10 decisions per phone number
      if (history.length > 10) {
        history.shift();
      }

      this.decisionHistory.set(phoneNumber, history);

      logger.debug('Decision stored in history:', {
        phoneNumber,
        shouldRespond: decision.shouldRespond,
        confidence: decision.confidence,
        riskLevel: decision.riskAssessment.level,
      });
    } catch (error) {
      logger.error('Error storing decision history:', error);
    }
  }

  /**
   * Build decision result object
   */
  private buildDecisionResult(
    shouldRespond: boolean,
    confidence: number,
    reasoning: string,
    factors: DecisionFactor[],
    riskAssessment: RiskAssessment,
    alternativeActions: string[],
    timeToDecision: number
  ): DecisionResult {
    return {
      shouldRespond,
      confidence,
      reasoning,
      factors,
      riskAssessment,
      alternativeActions,
      timeToDecision,
    };
  }
}
