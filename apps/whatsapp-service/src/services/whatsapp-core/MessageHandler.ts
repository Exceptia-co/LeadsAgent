import { logger } from '../../utils/logger';
import type { NormalizedWhatsAppMessage } from '../../types/messages';
import type { ReplyPort } from '../../types/reply-port';

/**
 * MessageHandler - Inbound message processing
 *
 * Responsibilities:
 * - AI message processing workflow
 * - Response strategies (quoting vs direct sending), via ReplyPort
 *
 * Engine-neutral: it answers through a ReplyPort and never holds a client.
 * The outbound path (sendMessage) moved to BaileysSessionManager with the
 * engine cutover.
 */
export class MessageHandler {
  /**
   * Process message with AI integration.
   *
   * `port` is how this method answers. It holds the engine's message handle
   * privately; nothing here knows which engine produced it. Everything read
   * comes from `dto`.
   */
  async processMessageWithAI(dto: NormalizedWhatsAppMessage, port: ReplyPort): Promise<void> {
    const sessionId = dto.sessionId;
    const startTime = Date.now();
    let aiResponse: string = '';
    let knowledgeBaseIdsUsed: string[] = [];

    try {
      logger.info(`🧠 Processing message with enhanced AI thinking for session ${sessionId}`);

      // Fase A (optimización 2026-04-19 tras prueba móvil del owner):
      // activar typing indicator AQUÍ, antes del LLM, no al final en
      // `sendResponseWithStrategy`. Razón: el pipeline completo tarda
      // 10-18 segundos (6-11s LLM + 5-6s humanized delay). Si el typing
      // solo se activa en el último tramo, el usuario ve silencio durante
      // 15s y luego "escribiendo..." fugaz. Activarlo temprano hace que
      // el indicator cubra todo el pipeline → percepción drásticamente
      // mejor con el mismo tiempo total. El transporte mantiene el state
      // ~25s sin clearState, suficiente para cubrir el flow.
      try {
        await port.startTyping();
        logger.debug('⌨️  Typing indicator activated early (covering LLM + humanized delay)');
      } catch (typingErr) {
        logger.warn('⚠️  Early typing indicator failed (non-blocking):', typingErr);
      }

      // Import services dynamically to avoid circular dependencies
      const { default: AIThinkingService } = await import('../AIThinkingService');
      const { default: DatabaseService } = await import('../DatabaseService');

      // Already suffix-free -- normalizeWwebjsMessage validates E.164 before
      // building the DTO.
      const phoneNumber = dto.senderPhone;

      // Derived once and passed only to the two INBOUND saveConversation
      // calls below -- the fallback reply at the bottom of this method is an
      // OUTBOUND, and the customer's message id/time do not describe it.
      const occurredAt = (() => {
        const seconds = Number(dto.timestamp);
        // `> 0`, not just "not NaN": `new Date(0 * 1000)` is a perfectly
        // valid Date -- 1 Jan 1970 -- and Number.isNaN waves it straight
        // through. That is T3 exactly, and T3 only stopped being harmless
        // once the proactive consent window started reasoning about recency.
        if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
        return new Date(seconds * 1000);
      })();
      // dto.id is `${sessionId}:${providerId}` -- keep the provider half.
      const providerMessageId = dto.id.includes(':')
        ? dto.id.split(':').slice(1).join(':')
        : dto.id;

      // B2.1: resolve tenantId + aiAgentId in a single query
      const { tenantId, aiAgentId } = await DatabaseService.getSessionContext(sessionId);
      if (!tenantId) {
        logger.warn(
          `[TENANT-SAFE] processMessageWithAI: session ${sessionId} has no tenantId — AI pipeline will run with unscoped reads`
        );
      }
      if (!aiAgentId) {
        logger.warn(
          `[AGENT-SAFE] processMessageWithAI: session ${sessionId} has no aiAgentId — using legacy prompt`
        );
      }

      // Enhanced processing with structured thinking
      const thinkingResult = await AIThinkingService.processWithThinking(dto.text, {
        from: phoneNumber,
        sessionId: sessionId,
        tenantId: tenantId ?? undefined,
        aiAgentId: aiAgentId ?? undefined,
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

        // Fase A (2026-04-19, post-prueba owner): eliminado el humanized
        // delay artificial. El LLM ya aporta 6-11s de latencia real y el
        // typing indicator (activado al inicio del handler) cubre visualmente
        // toda la espera. Añadir 5-6s encima solo duplicaba la latencia sin
        // beneficio perceptible. Si en Fase E7 llegan templates Tier-2 con
        // respuestas instantáneas, ahí se podrá introducir un delay con
        // target total (~3-4s) en vez de un delay sumado.

        // Determine sending method based on strategy
        const strategy = thinkingResult.thinkingProcess.responseStrategy;
        await this.sendResponseWithStrategy(port, dto.text, thinkingResult.content, strategy);

        // Fase A4 (2026-04-19): unificar las dos llamadas sueltas de
        // saveConversation (user msg + bot msg) en una única operación
        // paralela con try/catch compartido. Reduce latencia (dos round-trips
        // Postgres en paralelo) y evita estados inconsistentes donde el user
        // msg se persiste pero el bot msg no. saveConversation internamente
        // ya es unified-write (PRD Fase 1): cada llamada crea 1 fila en
        // `messages` + 1 en `whatsapp_conversations` con FK message_id.
        await this.persistMessagePair({
          sessionId,
          phoneNumber,
          userMessageText: dto.text,
          userMessageType: dto.type,
          botResponseText: thinkingResult.content,
          intent: thinkingResult.thinkingProcess.steps[0]?.data?.intent,
          sentiment: thinkingResult.thinkingProcess.steps[0]?.data?.sentiment,
          aiProvider: thinkingResult.provider,
          tokensUsed: thinkingResult.tokensUsed || 0,
          providerMessageId,
          occurredAt,
        });

        // Calculate success metrics for learning
        const responseTime = Date.now() - startTime;

        // Schedule success score calculation and logging after a delay
        setTimeout(async () => {
          await this.logSuccessfulInteraction(
            dto.text,
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
          messageText: dto.text,
          responseText: undefined,
          messageType: dto.type,
          intent: thinkingResult.thinkingProcess.steps[0]?.data?.intent || 'no_response',
          sentiment: thinkingResult.thinkingProcess.steps[0]?.data?.sentiment || 'neutral',
          aiProvider: thinkingResult.provider,
          tokensUsed: 0,
          isFromUser: true,
          providerMessageId,
          occurredAt,
          status: 'READ',
        });

        // Send intelligent fallback when AI thinking failed with an error
        if (thinkingResult.error) {
          logger.info(
            `🔄 AI thinking failed with error, using intelligent fallback for ${phoneNumber}`
          );
          try {
            const intelligentFallback = await this.generateIntelligentFallback(
              dto.text,
              phoneNumber,
              { tenantId: tenantId ?? undefined, aiAgentId: aiAgentId ?? undefined }
            );
            await port.reply(intelligentFallback);

            // Log the fallback usage. This is the reply we sent, not the
            // customer's message, so it goes in `responseText` with
            // `isFromUser: false` -- same shape as persistMessagePair's bot
            // write above. It used to go in `messageText`, the exact bug
            // found and fixed in persistMessagePair on 2026-04-19 and never
            // fixed here: saveConversation reads `responseText` when
            // `isFromUser` is false, so `canonicalContent` was null and the
            // row was dropped with a warning -- every intelligent-fallback
            // reply ever sent has gone unrecorded. It gets `status: 'SENT'`
            // and nothing else new -- the inbound's id and time do not
            // describe this reply.
            await DatabaseService.saveConversation({
              sessionId: sessionId,
              phoneNumber: phoneNumber,
              messageText: undefined,
              responseText: intelligentFallback,
              messageType: 'text',
              intent: 'fallback_response',
              sentiment: 'neutral',
              aiProvider: 'intelligent_fallback',
              tokensUsed: 0,
              isFromUser: false,
              status: 'SENT',
            });

            logger.info(`✅ Intelligent fallback sent to ${phoneNumber}`);
          } catch (replyError) {
            logger.error('Error sending intelligent fallback message:', replyError);
            // Only use generic fallback as last resort
            try {
              await port.reply(
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
      const phoneNumber = dto.senderPhone;

      // Critical error fallback — tenantId/aiAgentId unavailable (declared in try block).
      // KB search here is intentionally unscoped; the warning will fire from DatabaseService.
      try {
        const intelligentFallback = await this.generateIntelligentFallback(dto.text, phoneNumber);
        await port.reply(intelligentFallback);
      } catch (replyError) {
        logger.error('Error sending intelligent fallback message:', replyError);
        // Last resort generic message
        try {
          await port.reply('Gracias por tu mensaje. Un representante te contactará pronto. 👍');
        } catch (finalError) {
          logger.error('Error sending final fallback:', finalError);
        }
      }
    }
  }

  /**
   * Send response with intelligent quoting strategy
   */
  private async sendResponseWithStrategy(
    port: ReplyPort,
    userMessageText: string,
    responseText: string,
    strategy: any
  ): Promise<void> {
    // Fase A3 (2026-04-19): typing indicator para que la respuesta de la IA
    // se vea natural en WhatsApp. Sin esto el mensaje aparece "de golpe" y el
    // usuario percibe al bot como robótico.
    try {
      await port.startTyping();
    } catch (typingErr) {
      // No bloqueante: si falla, seguimos con el envío sin indicator. Evita
      // que un problema transitorio impida la respuesta.
      logger.warn('⚠️  Could not send typing state (continuing without):', typingErr);
    }

    try {
      if (
        strategy.shouldQuote ||
        this.shouldQuoteBasedOnContext(userMessageText, responseText, strategy)
      ) {
        await port.reply(responseText);
        logger.debug('📝 Response sent with quote');
      } else {
        await port.send(responseText);
        logger.debug('📝 Response sent without quote');
      }
    } catch (error) {
      logger.error('Error in sendResponseWithStrategy:', error);
      // Fallback to simple reply
      await port.reply(responseText);
    } finally {
      // Limpiar el typing state siempre — tanto en éxito como en fallback.
      // Antes esto iba condicionado a haber obtenido el chat; el port ya
      // encapsula esa búsqueda, así que se llama incondicionalmente y el
      // catch absorbe el caso en que nunca llegó a activarse.
      try {
        await port.stopTyping();
      } catch (clearErr) {
        logger.debug('Could not clear typing state (non-critical):', clearErr);
      }
    }
  }

  /**
   * Determine if we should quote based on message context
   */
  private shouldQuoteBasedOnContext(rawText: string, responseText: string, strategy: any): boolean {
    // Always quote if strategy explicitly says so
    if (strategy.shouldQuote === true) return true;
    if (strategy.shouldQuote === false) return false;

    // Smart quoting logic
    const messageText = rawText.toLowerCase();

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
    messageText: string,
    phoneNumber: string,
    opts?: { tenantId?: string; aiAgentId?: string }
  ): Promise<string> {
    try {
      logger.info(`🔍 Generating intelligent fallback for ${phoneNumber}`);

      const { default: DatabaseService } = await import('../DatabaseService');
      const { default: AIService } = await import('../AIService');

      const kbOpts =
        opts?.tenantId || opts?.aiAgentId
          ? { tenantId: opts.tenantId, agentId: opts.aiAgentId }
          : undefined;
      const knowledgeResults = await DatabaseService.searchKnowledgeBase(messageText, kbOpts);

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
      return this.generateSmartGenericFallback(messageText);
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

  /**
   * Fase A4 (2026-04-19): helper unificado para persistir user msg + bot
   * response en una operación. Ejecuta las dos llamadas a saveConversation
   * en paralelo (Promise.allSettled) con logging unificado de errores.
   *
   * Se usa allSettled en vez de all para que, si el user msg se persiste
   * pero el bot msg falla, no perdamos el user msg (allSettled no propaga
   * el reject). Logueamos cada resultado para observabilidad.
   *
   * TODO (futuro, cuando llegue AiAgent FK en Fase B): cambiar a una
   * operación transaccional única en DatabaseService que cree el par de
   * mensajes con FK bidireccional. Por ahora mantenemos compat con el
   * modelo unified-write actual.
   */
  private async persistMessagePair(params: {
    sessionId: string;
    phoneNumber: string;
    userMessageText: string;
    userMessageType: string;
    botResponseText: string;
    intent?: string;
    sentiment?: string;
    aiProvider: string;
    tokensUsed: number;
    providerMessageId?: string;
    occurredAt?: Date;
  }): Promise<void> {
    const { default: DatabaseService } = await import('../DatabaseService');
    const {
      sessionId,
      phoneNumber,
      userMessageText,
      userMessageType,
      botResponseText,
      intent,
      sentiment,
      aiProvider,
      tokensUsed,
      providerMessageId,
      occurredAt,
    } = params;

    const [userResult, botResult] = await Promise.allSettled([
      DatabaseService.saveConversation({
        sessionId,
        phoneNumber,
        messageText: userMessageText,
        responseText: undefined,
        messageType: userMessageType,
        intent: intent || 'unknown',
        sentiment: sentiment || 'neutral',
        aiProvider,
        tokensUsed,
        isFromUser: true,
        providerMessageId,
        occurredAt,
        status: 'READ',
      }),
      DatabaseService.saveConversation({
        sessionId,
        phoneNumber,
        // DatabaseService.saveConversation usa `canonicalContent` = isFromUser
        // ? messageText : responseText. Para el bot msg (isFromUser=false) el
        // contenido debe ir en `responseText`. Bug detectado en prueba del
        // owner 2026-04-19: antes tenía messageText y el warn
        // "called without canonical content — skipping message row" indicaba
        // que el bot msg no se persistía.
        messageText: undefined,
        responseText: botResponseText,
        messageType: 'text',
        intent: intent || 'response',
        sentiment: 'neutral',
        aiProvider,
        tokensUsed: 0,
        isFromUser: false,
        // Outbound: the inbound's id and time do not describe this reply.
        status: 'SENT',
      }),
    ]);

    if (userResult.status === 'rejected') {
      logger.error('💾 [PAIR] Failed to persist user message:', userResult.reason);
    }
    if (botResult.status === 'rejected') {
      logger.error('💾 [PAIR] Failed to persist bot response:', botResult.reason);
    }
    if (userResult.status === 'fulfilled' && botResult.status === 'fulfilled') {
      logger.debug('💾 [PAIR] Message pair persisted OK', {
        userMsgId: userResult.value,
        botMsgId: botResult.value,
      });
    }
  }
}

export default new MessageHandler();
