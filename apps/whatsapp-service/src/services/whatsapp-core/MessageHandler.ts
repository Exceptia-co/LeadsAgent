import type { Client, Message } from 'whatsapp-web.js';
import { logger } from '../../utils/logger';
import type { WhatsAppMessage, SendMessageResponse } from '../../types';

/**
 * MessageHandler - Handles all message sending, receiving, and processing operations
 *
 * Responsibilities:
 * - Message sending with proper phone number normalization
 * - Message parsing and transformation
 * - AI message processing workflow
 * - Message validation and error handling
 * - Response strategies (quoting vs direct sending)
 *
 * Extracted from WhatsAppServiceSimple lines: 486-1072, 1597-1705
 */
export class MessageHandler {
  /**
   * Send a message through WhatsApp
   */
  async sendMessage(
    client: Client,
    sessionId: string,
    to: string,
    message: string,
    onStatusUpdate: (sessionId: string, status: string, data?: any) => Promise<void>
  ): Promise<SendMessageResponse> {
    try {
      if (!client) {
        return {
          success: false,
          error: `Session ${sessionId} not found`,
        };
      }

      // Update health check on successful message sending attempt
      await onStatusUpdate(sessionId, 'ready', {
        lastHealthCheck: new Date(),
      });

      // Normalize phone number for WhatsApp Web compatibility
      let normalizedNumber: string;
      try {
        normalizedNumber = this.normalizePhoneNumber(to);
      } catch (normalizationError) {
        const errorMessage =
          normalizationError instanceof Error
            ? normalizationError.message
            : 'Invalid phone number format';

        logger.error(`📞 Phone normalization failed for ${to}:`, errorMessage);
        return {
          success: false,
          error: `Phone number validation failed: ${errorMessage}`,
        };
      }

      const formattedNumber = normalizedNumber.includes('@c.us')
        ? normalizedNumber
        : `${normalizedNumber}@c.us`;

      logger.info(`📞 WhatsApp Service - Attempting to send message:`, {
        sessionId,
        originalNumber: to,
        normalizedNumber,
        formattedNumber,
        messagePreview: message.substring(0, 50) + '...',
      });

      const sentMessage = await client.sendMessage(formattedNumber, message);

      logger.info(`Message sent successfully in session ${sessionId}`, {
        to: formattedNumber,
        messageId: sentMessage.id._serialized,
      });

      // Update health check on successful message sent
      await onStatusUpdate(sessionId, 'ready', {
        lastHealthCheck: new Date(),
      });

      return {
        success: true,
        messageId: sentMessage.id._serialized,
      };
    } catch (error) {
      logger.error(`Error sending message in session ${sessionId}:`, error);

      // Provide more specific error messages for common issues
      let errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('Evaluation failed')) {
        errorMessage =
          'WhatsApp Web evaluation failed - possibly due to invalid phone number format or session state';
      } else if (errorMessage.includes('net::ERR_')) {
        errorMessage = 'Network error - check internet connection';
      } else if (errorMessage.includes('Target closed')) {
        errorMessage = 'WhatsApp session was closed unexpectedly';
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Parse a WhatsApp message into our internal format
   */
  async parseMessage(message: Message, sessionId: string): Promise<WhatsAppMessage> {
    const contact = await message.getContact();
    const chat = await message.getChat();

    return {
      id: message.id._serialized,
      from: contact.id._serialized,
      to: message.to,
      body: message.body,
      timestamp: message.timestamp,
      type: message.type as any,
      isGroup: chat.isGroup,
      fromMe: message.fromMe,
    };
  }

  /**
   * Process message with AI integration
   */
  async processMessageWithAI(
    originalMessage: Message,
    whatsappMessage: WhatsAppMessage,
    sessionId: string
  ): Promise<void> {
    const startTime = Date.now();
    let aiResponse: string = '';
    let knowledgeBaseIdsUsed: string[] = [];

    try {
      logger.info(`🧠 Processing message with enhanced AI thinking for session ${sessionId}`);

      // Import services dynamically to avoid circular dependencies
      const { default: AIThinkingService } = await import('../AIThinkingService');
      const { default: DatabaseService } = await import('../DatabaseService');

      // Get phone number without WhatsApp suffix
      const phoneNumber = whatsappMessage.from.replace('@c.us', '');

      // Enhanced processing with structured thinking
      const thinkingResult = await AIThinkingService.processWithThinking(whatsappMessage.body, {
        from: whatsappMessage.from,
        sessionId: sessionId,
        phoneNumber: phoneNumber,
      });

      // Extract knowledge base IDs used from knowledge retrieval step
      const knowledgeStep = thinkingResult.thinkingProcess.steps.find(
        s => s.type === 'knowledge_retrieval'
      );
      knowledgeBaseIdsUsed = knowledgeStep?.data?.map((item: any) => item.id).filter(Boolean) || [];

      logger.info(
        `🧠 [THINKING RESULT] Decision: ${thinkingResult.thinkingProcess.shouldRespond ? 'RESPOND' : 'NO RESPONSE'}`,
        {
          confidence: thinkingResult.thinkingProcess.confidence,
          processingTime: thinkingResult.thinkingProcess.processingTimeMs,
          steps: thinkingResult.thinkingProcess.steps.length,
          complexity: thinkingResult.thinkingProcess.estimatedComplexity,
          finalDecision: thinkingResult.thinkingProcess.finalDecision,
        }
      );

      // Log detailed thinking process for debugging
      thinkingResult.thinkingProcess.steps.forEach(step => {
        logger.debug(`🧠 [STEP ${step.step}] ${step.title}:`, {
          type: step.type,
          content: step.content.substring(0, 150),
          confidence: step.confidence,
        });
      });

      if (
        thinkingResult.thinkingProcess.shouldRespond &&
        thinkingResult.success &&
        thinkingResult.content
      ) {
        aiResponse = thinkingResult.content;

        // Calculate enhanced delay based on thinking complexity
        const complexityDelayMultiplier = {
          simple: 1.0,
          medium: 1.3,
          complex: 1.8,
        }[thinkingResult.thinkingProcess.estimatedComplexity];

        // Add humanized delay with complexity factor
        await this.addHumanizedDelayEnhanced(
          whatsappMessage.body,
          thinkingResult.thinkingProcess,
          complexityDelayMultiplier
        );

        // Determine sending method based on strategy
        const strategy = thinkingResult.thinkingProcess.responseStrategy;
        await this.sendResponseWithStrategy(originalMessage, thinkingResult.content, strategy);

        // Save enhanced conversation data to database
        await DatabaseService.saveConversation({
          sessionId: sessionId,
          phoneNumber: phoneNumber,
          messageText: whatsappMessage.body,
          responseText: undefined,
          messageType: whatsappMessage.type,
          intent: thinkingResult.thinkingProcess.steps[0]?.data?.intent || 'unknown',
          sentiment: thinkingResult.thinkingProcess.steps[0]?.data?.sentiment || 'neutral',
          aiProvider: thinkingResult.provider,
          tokensUsed: thinkingResult.tokensUsed || 0,
          isFromUser: true,
        });

        // Save AI response
        await DatabaseService.saveConversation({
          sessionId: sessionId,
          phoneNumber: phoneNumber,
          messageText: thinkingResult.content,
          responseText: undefined,
          messageType: 'text',
          intent: thinkingResult.thinkingProcess.steps[0]?.data?.intent || 'response',
          sentiment: 'neutral',
          aiProvider: thinkingResult.provider,
          tokensUsed: 0,
          isFromUser: false,
        });

        // Calculate success metrics for learning
        const responseTime = Date.now() - startTime;

        // Schedule success score calculation and logging after a delay
        setTimeout(async () => {
          await this.logSuccessfulInteraction(
            whatsappMessage.body,
            aiResponse,
            knowledgeBaseIdsUsed,
            phoneNumber,
            sessionId,
            responseTime,
            thinkingResult.thinkingProcess.steps[0]?.data?.intent,
            thinkingResult.thinkingProcess.steps[0]?.data?.sentiment
          );
        }, 5000); // Wait 5 seconds before calculating success metrics

        logger.info(`✅ Enhanced AI response sent successfully to ${phoneNumber}:`, {
          messageLength: thinkingResult.content.length,
          provider: thinkingResult.provider,
          tokensUsed: thinkingResult.tokensUsed,
          thinkingTime: thinkingResult.thinkingProcess.processingTimeMs,
          confidence: thinkingResult.thinkingProcess.confidence,
          strategy: `${strategy.type} (${strategy.tone}, ${strategy.length})`,
        });
      } else {
        // No response decision or error
        const reason = !thinkingResult.thinkingProcess.shouldRespond
          ? thinkingResult.thinkingProcess.finalDecision
          : thinkingResult.error || 'Unknown error';

        logger.info(`❌ No AI response sent to ${phoneNumber}. Reason: ${reason}`);

        // Still save the user message for record keeping
        await DatabaseService.saveConversation({
          sessionId: sessionId,
          phoneNumber: phoneNumber,
          messageText: whatsappMessage.body,
          responseText: undefined,
          messageType: whatsappMessage.type,
          intent: thinkingResult.thinkingProcess.steps[0]?.data?.intent || 'no_response',
          sentiment: thinkingResult.thinkingProcess.steps[0]?.data?.sentiment || 'neutral',
          aiProvider: thinkingResult.provider,
          tokensUsed: 0,
          isFromUser: true,
        });

        // Send intelligent fallback when AI thinking failed with an error
        if (thinkingResult.error) {
          logger.info(
            `🔄 AI thinking failed with error, using intelligent fallback for ${phoneNumber}`
          );
          try {
            const intelligentFallback = await this.generateIntelligentFallback(
              originalMessage,
              phoneNumber
            );
            await originalMessage.reply(intelligentFallback);

            // Log the fallback usage
            await DatabaseService.saveConversation({
              sessionId: sessionId,
              phoneNumber: phoneNumber,
              messageText: intelligentFallback,
              responseText: undefined,
              messageType: 'text',
              intent: 'fallback_response',
              sentiment: 'neutral',
              aiProvider: 'intelligent_fallback',
              tokensUsed: 0,
              isFromUser: false,
            });

            logger.info(`✅ Intelligent fallback sent to ${phoneNumber}`);
          } catch (replyError) {
            logger.error('Error sending intelligent fallback message:', replyError);
            // Only use generic fallback as last resort
            try {
              await originalMessage.reply(
                'Disculpa, en este momento no puedo procesar tu mensaje. Un agente se pondrá en contacto contigo pronto. 😊'
              );
            } catch (finalError) {
              logger.error('Error sending final fallback:', finalError);
            }
          }
        } else if (!thinkingResult.thinkingProcess.shouldRespond) {
          logger.info(
            `🤐 AI decided not to respond to ${phoneNumber}. Reason: ${thinkingResult.thinkingProcess.finalDecision}`
          );
        }
      }
    } catch (error) {
      logger.error('❌ Error in enhanced processMessageWithAI:', error);

      // Get phone number for fallback (define it here since it's in catch block)
      const phoneNumber = whatsappMessage.from.replace('@c.us', '');

      // Send intelligent fallback message on critical error
      try {
        const intelligentFallback = await this.generateIntelligentFallback(
          originalMessage,
          phoneNumber
        );
        await originalMessage.reply(intelligentFallback);
      } catch (replyError) {
        logger.error('Error sending intelligent fallback message:', replyError);
        // Last resort generic message
        try {
          await originalMessage.reply(
            'Gracias por tu mensaje. Un representante te contactará pronto. 👍'
          );
        } catch (finalError) {
          logger.error('Error sending final fallback:', finalError);
        }
      }
    }
  }

  /**
   * Normalize phone number for WhatsApp Web compatibility
   */
  private normalizePhoneNumber(phoneNumber: string): string {
    if (!phoneNumber) {
      throw new Error('Phone number is required');
    }

    // Remove WhatsApp suffix if present
    let normalized = phoneNumber.replace(/@c\.us$/, '').replace(/@g\.us$/, '');

    // Remove '+' prefix that causes issues with WhatsApp Web
    normalized = normalized.replace(/^\+/, '');

    // Remove any spaces, dashes, or parentheses
    normalized = normalized.replace(/[\s\-\(\)]/g, '');

    // Ensure it's only digits
    normalized = normalized.replace(/[^\d]/g, '');

    // Validate the result
    if (!normalized || normalized.length < 8 || normalized.length > 15) {
      throw new Error(`Invalid phone number format: ${phoneNumber}. Expected 8-15 digits.`);
    }

    logger.debug(`📞 Phone normalization: ${phoneNumber} → ${normalized}`);

    return normalized;
  }

  /**
   * Add humanized delay before responding to simulate human behavior
   */
  private async addHumanizedDelay(messageText: string): Promise<void> {
    // Get delay settings from environment variables
    const minDelay = parseInt(process.env.AI_RESPONSE_DELAY_MIN || '2000'); // 2 seconds default
    const maxDelay = parseInt(process.env.AI_RESPONSE_DELAY_MAX || '6000'); // 6 seconds default

    // Calculate delay based on message length (longer messages = longer thinking time)
    const baseDelay = Math.min(messageText.length * 50, 2000); // 50ms per character, max 2s extra
    const randomDelay = Math.random() * (maxDelay - minDelay) + minDelay;
    const totalDelay = Math.min(randomDelay + baseDelay, maxDelay);

    logger.info(
      `⏱️ Adding humanized delay: ${Math.round(totalDelay)}ms (message length: ${messageText.length})`
    );

    await new Promise(resolve => setTimeout(resolve, totalDelay));
  }

  /**
   * Enhanced delay with complexity-based timing
   */
  private async addHumanizedDelayEnhanced(
    messageText: string,
    thinkingProcess: any,
    complexityMultiplier: number = 1.0
  ): Promise<void> {
    // Get delay settings from environment variables
    const minDelay = parseInt(process.env.AI_RESPONSE_DELAY_MIN || '2000');
    const maxDelay = parseInt(process.env.AI_RESPONSE_DELAY_MAX || '8000'); // Increased max for complex thinking

    // Base delay from original method
    const baseDelay = Math.min(messageText.length * 50, 2000);

    // Add thinking complexity factor
    const thinkingDelay = Math.min(thinkingProcess.processingTimeMs * 0.3, 2000); // 30% of thinking time, max 2s

    // Add confidence factor (lower confidence = more "hesitation")
    const confidenceFactor = Math.max(0.5, thinkingProcess.confidence);
    const hesitationDelay = (1 - confidenceFactor) * 1500; // Up to 1.5s hesitation

    // Random variation for human-like behavior
    const randomVariation = Math.random() * 1000;

    // Calculate total delay
    const calculatedDelay =
      (baseDelay + thinkingDelay + hesitationDelay + randomVariation) * complexityMultiplier;

    const totalDelay = Math.max(minDelay, Math.min(calculatedDelay, maxDelay));

    logger.info(`🧠⏱️ Enhanced delay: ${Math.round(totalDelay)}ms`, {
      messageLength: messageText.length,
      complexity: thinkingProcess.estimatedComplexity,
      confidence: thinkingProcess.confidence,
      thinkingTime: thinkingProcess.processingTimeMs,
      multiplier: complexityMultiplier,
    });

    await new Promise(resolve => setTimeout(resolve, totalDelay));
  }

  /**
   * Send response with intelligent quoting strategy
   */
  private async sendResponseWithStrategy(
    originalMessage: Message,
    responseText: string,
    strategy: any
  ): Promise<void> {
    try {
      if (
        strategy.shouldQuote ||
        this.shouldQuoteBasedOnContext(originalMessage, responseText, strategy)
      ) {
        // Quote the original message
        await originalMessage.reply(responseText);
        logger.debug('📝 Response sent with quote');
      } else {
        // Send without quoting
        const chat = await originalMessage.getChat();
        await chat.sendMessage(responseText);
        logger.debug('📝 Response sent without quote');
      }
    } catch (error) {
      logger.error('Error in sendResponseWithStrategy:', error);
      // Fallback to simple reply
      await originalMessage.reply(responseText);
    }
  }

  /**
   * Determine if we should quote based on message context
   */
  private shouldQuoteBasedOnContext(
    originalMessage: Message,
    responseText: string,
    strategy: any
  ): boolean {
    // Always quote if strategy explicitly says so
    if (strategy.shouldQuote === true) return true;
    if (strategy.shouldQuote === false) return false;

    // Smart quoting logic
    const messageText = originalMessage.body?.toLowerCase() || '';

    // Quote for direct questions
    if (
      messageText.includes('?') ||
      messageText.includes('cuánto') ||
      messageText.includes('cómo') ||
      messageText.includes('qué') ||
      messageText.includes('dónde') ||
      messageText.includes('cuándo')
    ) {
      return true;
    }

    // Quote for complaints or support requests
    if (strategy.tone === 'supportive' || strategy.priority === 'high') {
      return true;
    }

    // Don't quote for simple greetings
    if (
      messageText.includes('hola') ||
      messageText.includes('buenos') ||
      messageText.includes('buenas')
    ) {
      return false;
    }

    // Don't quote for long conversations (default)
    return false;
  }

  /**
   * Log successful interactions for AI learning
   */
  private async logSuccessfulInteraction(
    userMessage: string,
    aiResponse: string,
    knowledgeBaseIds: string[],
    phoneNumber: string,
    sessionId: string,
    responseTimeMs: number,
    intent?: string,
    sentiment?: string
  ): Promise<void> {
    try {
      // Import services dynamically
      const AILearningService = await import('../AILearningService');

      // Calculate initial success score based on response time and complexity
      const initialSuccessScore = this.calculateInitialSuccessScore(
        userMessage,
        aiResponse,
        responseTimeMs
      );

      // Prepare contextual metrics
      const contextMetrics = {
        responseTimeMs,
        messageLength: userMessage.length,
        responseLength: aiResponse.length,
        intent: intent || 'unknown',
        sentiment: sentiment || 'neutral',
        timestamp: new Date().toISOString(),
      };

      // Log the training interaction
      await AILearningService.default.logInteraction({
        userMessage,
        aiResponse,
        knowledgeBaseIdsUsed: knowledgeBaseIds,
        successScore: initialSuccessScore,
        contextData: {
          phoneNumber,
          sessionId,
          intent,
          sentiment,
          responseTime: responseTimeMs,
        },
        feedbackMetrics: {
          conversationContinued: false, // Will be updated later
          responseTime: responseTimeMs,
          followUpQuestions: 0,
          userSatisfactionIndicators: [],
        },
      });

      logger.info(
        `📊 Logged training interaction for learning with score: ${initialSuccessScore.toFixed(2)}`,
        {
          phoneNumber,
          messageLength: userMessage.length,
          responseTime: responseTimeMs,
          knowledgeBaseCount: knowledgeBaseIds.length,
        }
      );
    } catch (error) {
      // Non-blocking error handling for learning system
      logger.error('Error logging training interaction:', error);
    }
  }

  /**
   * Calculate initial success score based on heuristics
   */
  private calculateInitialSuccessScore(
    userMessage: string,
    aiResponse: string,
    responseTimeMs: number
  ): number {
    // Base score starts at 0.7 (neutral)
    let score = 0.7;

    // Factor 1: Response time penalty (slower = lower score)
    if (responseTimeMs < 5000) {
      score += 0.1; // Fast response bonus
    } else if (responseTimeMs > 15000) {
      score -= 0.1; // Slow response penalty
    }

    // Factor 2: Response length appropriateness
    const responseRatio = aiResponse.length / Math.max(userMessage.length, 1);
    if (userMessage.length < 20 && aiResponse.length > 200) {
      score -= 0.1; // Too verbose for short question
    } else if (userMessage.length > 100 && aiResponse.length < 50) {
      score -= 0.1; // Too brief for detailed question
    } else if (responseRatio > 0.5 && responseRatio < 5) {
      score += 0.1; // Good ratio of question to answer
    }

    // Factor 3: Presence of questions in user message
    if (
      userMessage.includes('?') ||
      userMessage.toLowerCase().includes('cómo') ||
      userMessage.toLowerCase().includes('qué') ||
      userMessage.toLowerCase().includes('cuándo') ||
      userMessage.toLowerCase().includes('dónde') ||
      userMessage.toLowerCase().includes('por qué')
    ) {
      // Direct questions should be answered thoroughly
      if (aiResponse.length > 100) {
        score += 0.1; // Good detailed answer to question
      }
    }

    // Ensure score stays within bounds 0.0-1.0
    return Math.max(0.0, Math.min(1.0, score));
  }

  /**
   * Generate intelligent fallback response
   */
  private async generateIntelligentFallback(
    originalMessage: Message,
    phoneNumber: string
  ): Promise<string> {
    try {
      logger.info(`🔍 Generating intelligent fallback for ${phoneNumber}`);

      // Import services
      const { default: DatabaseService } = await import('../DatabaseService');
      const { default: AIService } = await import('../AIService');

      const messageText = originalMessage.body || '';

      // Search knowledge base for relevant information
      const knowledgeResults = await DatabaseService.searchKnowledgeBase(messageText);

      if (knowledgeResults.length > 0) {
        logger.info(`📚 Found ${knowledgeResults.length} relevant knowledge base entries`);

        // Use the most relevant entry
        const mostRelevant = knowledgeResults[0];

        // Create a simplified context for AI response
        const context = {
          userMessage: messageText,
          knowledgeTitle: mostRelevant.title,
          knowledgeContent: mostRelevant.content,
          keywords: mostRelevant.keywords,
        };

        // Generate contextual response using AI
        const aiResponse = await AIService.generateResponse(
          `Basándote en esta información de nuestra base de conocimientos, genera una respuesta útil y amigable para el usuario.

Pregunta del usuario: "${messageText}"

Información relevante encontrada:
Título: ${mostRelevant.title}
Contenido: ${mostRelevant.content}
Palabras clave: ${mostRelevant.keywords}

Genera una respuesta que:
1. Sea útil y directa
2. Use un tono amigable
3. Invite a continuar la conversación
4. No sea más de 200 palabras
5. Incluya información relevante de nuestra base de conocimientos

Respuesta:`,
          {
            from: phoneNumber,
            sessionId: 'fallback',
            phoneNumber: phoneNumber.replace('@c.us', ''),
          }
        );

        if (aiResponse.success && aiResponse.content) {
          logger.info('✅ Generated intelligent fallback from knowledge base');
          return aiResponse.content;
        }
      }

      // If no knowledge base results, try to categorize the message and provide smart fallback
      const smartFallback = this.generateSmartGenericFallback(messageText);
      logger.info('🎯 Generated smart generic fallback');
      return smartFallback;
    } catch (error) {
      logger.error('Error generating intelligent fallback:', error);

      // Return smart generic fallback as last resort
      return this.generateSmartGenericFallback(originalMessage.body || '');
    }
  }

  /**
   * Generate smart generic fallback based on message content
   */
  private generateSmartGenericFallback(messageText: string): string {
    const message = messageText.toLowerCase();

    // Categorize message type and provide appropriate response
    if (message.includes('precio') || message.includes('costo') || message.includes('cuánto')) {
      return 'Hola! 💰 Entiendo que consultas sobre precios. Te conectaré con un especialista que puede darte información detallada sobre tarifas y servicios. Un momento por favor.';
    }

    if (message.includes('servicio') || message.includes('qué') || message.includes('cómo')) {
      return 'Hola! 🌟 Veo que tienes consultas sobre nuestros servicios. Te pondré en contacto con un experto que puede resolver todas tus dudas. En unos momentos te contactará.';
    }

    if (
      message.includes('ubicación') ||
      message.includes('dónde') ||
      message.includes('dirección')
    ) {
      return 'Hola! 📍 Te ayudo con información de ubicación. Un agente especializado te contactará muy pronto con todos los detalles que necesitas.';
    }

    if (message.includes('horario') || message.includes('abierto') || message.includes('cerrado')) {
      return 'Hola! ⏰ Te ayudo con información sobre horarios. Un representante te contactará enseguida con todos los detalles.';
    }

    if (message.includes('hola') || message.includes('buenos') || message.includes('buenas')) {
      return 'Hola! 👋 Gracias por contactarnos. Te conectaré con uno de nuestros especialistas que podrá ayudarte de inmediato.';
    }

    if (message.includes('gracias') || message.includes('perfecto') || message.includes('ok')) {
      return 'De nada! 😊 Si tienes alguna otra consulta, no dudes en escribir. Un agente estará disponible para ayudarte.';
    }

    // Default intelligent fallback
    return 'Hola! 👋 He recibido tu mensaje y entiendo que necesitas información. Te pondré en contacto con uno de nuestros especialistas que podrá ayudarte de manera personalizada. En unos momentos te contactará. ¡Gracias por elegirnos!';
  }
}

export default new MessageHandler();
