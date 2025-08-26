"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = require("../utils/logger");
const DatabaseService_1 = __importDefault(require("./DatabaseService"));
// ============================================
// CLASE PRINCIPAL DEL SISTEMA DE APRENDIZAJE
// ============================================
class AILearningService {
    constructor() {
        // Cache para optimizar análisis de patrones
        this.patternCache = new Map();
        this.lastCacheUpdate = 0;
        this.CACHE_DURATION = 300000; // 5 minutos
    }
    static getInstance() {
        if (!AILearningService.instance) {
            AILearningService.instance = new AILearningService();
        }
        return AILearningService.instance;
    }
    // ============================================
    // MÉTODOS PRINCIPALES DE APRENDIZAJE
    // ============================================
    /**
     * Registra una interacción exitosa para aprendizaje futuro
     */
    async logInteraction(interaction) {
        try {
            logger_1.logger.info(`📊 Logging learning interaction for ${interaction.contextData.phoneNumber}`);
            const interactionId = await DatabaseService_1.default.saveTrainingInteraction({
                ...interaction,
                timestamp: new Date()
            });
            if (interactionId) {
                logger_1.logger.debug(`✅ Training interaction saved with ID: ${interactionId}`);
                // Trigger async pattern analysis (no await para no bloquear)
                this.analyzePatternAsync(interaction.userMessage, interaction.successScore).catch(error => {
                    logger_1.logger.error('Error in async pattern analysis:', error);
                });
                return interactionId;
            }
            return null;
        }
        catch (error) {
            logger_1.logger.error('Error logging learning interaction:', error);
            return null;
        }
    }
    /**
     * Calcula el score de éxito basado en métricas de conversación
     */
    calculateSuccessScore(userMessage, aiResponse, metrics) {
        let score = 0.5; // Base score
        // Factor 1: Continuación de conversación (más importante)
        if (metrics.conversationContinued) {
            score += 0.3;
            logger_1.logger.debug('✅ Conversation continued (+0.3)');
        }
        else {
            score -= 0.2;
            logger_1.logger.debug('❌ Conversation ended (-0.2)');
        }
        // Factor 2: Tiempo de respuesta apropiado
        if (metrics.responseTime) {
            if (metrics.responseTime < 5000) { // Menos de 5 segundos
                score += 0.1;
                logger_1.logger.debug('⚡ Fast response (+0.1)');
            }
            else if (metrics.responseTime > 30000) { // Más de 30 segundos
                score -= 0.1;
                logger_1.logger.debug('🐌 Slow response (-0.1)');
            }
        }
        // Factor 3: Preguntas de seguimiento (indica engagement)
        if (metrics.followUpQuestions > 0) {
            score += Math.min(metrics.followUpQuestions * 0.1, 0.2);
            logger_1.logger.debug(`🤔 Follow-up questions (+${Math.min(metrics.followUpQuestions * 0.1, 0.2)})`);
        }
        // Factor 4: Indicadores de satisfacción
        const satisfactionScore = metrics.userSatisfactionIndicators.length * 0.05;
        score += satisfactionScore;
        if (satisfactionScore > 0) {
            logger_1.logger.debug(`😊 Satisfaction indicators (+${satisfactionScore})`);
        }
        // Factor 5: Uso efectivo de knowledge base
        if (metrics.knowledgeBaseUsed && metrics.conversationContinued) {
            score += 0.15;
            logger_1.logger.debug('📚 Knowledge base effectively used (+0.15)');
        }
        // Factor 6: Longitud apropiada de respuesta
        if (metrics.messageLength) {
            const idealLength = userMessage.length * 2; // Respuesta debería ser ~2x la pregunta
            const lengthRatio = metrics.messageLength / idealLength;
            if (lengthRatio >= 0.5 && lengthRatio <= 1.5) {
                score += 0.05;
                logger_1.logger.debug('📏 Appropriate response length (+0.05)');
            }
        }
        // Normalize score between 0 and 1
        const finalScore = Math.max(0, Math.min(1, score));
        logger_1.logger.debug(`📊 Success score calculated: ${finalScore.toFixed(3)} for message: "${userMessage.substring(0, 50)}..."`);
        return finalScore;
    }
    /**
     * Analiza patrones frecuentes y sugiere mejoras
     */
    async analyzeFrequentPatterns(limit = 50) {
        try {
            logger_1.logger.info('🔍 Analyzing frequent patterns for learning insights');
            // Check cache first
            if (this.shouldUseCache()) {
                const cachedPatterns = Array.from(this.patternCache.values());
                if (cachedPatterns.length > 0) {
                    logger_1.logger.debug('Using cached pattern analysis');
                    return cachedPatterns.slice(0, limit);
                }
            }
            const interactions = await DatabaseService_1.default.getTrainingInteractions(500); // Analizar últimas 500 interacciones
            if (interactions.length === 0) {
                logger_1.logger.warn('No training interactions found for pattern analysis');
                return [];
            }
            // Agrupar mensajes similares
            const patternGroups = this.groupSimilarMessages(interactions);
            // Calcular métricas para cada patrón
            const patterns = [];
            for (const [pattern, interactionGroup] of patternGroups.entries()) {
                const frequency = interactionGroup.length;
                const avgSuccessScore = interactionGroup.reduce((sum, i) => sum + i.successScore, 0) / frequency;
                const lastSeen = new Date(Math.max(...interactionGroup.map(i => i.timestamp.getTime())));
                const frequentPattern = {
                    pattern,
                    frequency,
                    averageSuccessScore: avgSuccessScore,
                    lastSeen,
                    suggestedKnowledgeEntry: await this.generateKnowledgeEntrySuggestion(pattern, interactionGroup)
                };
                patterns.push(frequentPattern);
            }
            // Ordenar por frecuencia y score de éxito
            const sortedPatterns = patterns
                .sort((a, b) => (b.frequency * b.averageSuccessScore) - (a.frequency * a.averageSuccessScore))
                .slice(0, limit);
            // Update cache
            this.updatePatternCache(sortedPatterns);
            logger_1.logger.info(`📈 Found ${sortedPatterns.length} frequent patterns`);
            return sortedPatterns;
        }
        catch (error) {
            logger_1.logger.error('Error analyzing frequent patterns:', error);
            return [];
        }
    }
    /**
     * Sugiere nuevas entradas para la knowledge base basado en patrones
     */
    async suggestKnowledgeBaseEntries() {
        try {
            logger_1.logger.info('💡 Generating knowledge base suggestions from learning data');
            const patterns = await this.analyzeFrequentPatterns(20);
            const suggestions = [];
            for (const pattern of patterns) {
                // Solo sugerir para patrones con baja satisfacción o alta frecuencia
                if (pattern.frequency >= 3 && (pattern.averageSuccessScore < 0.7 || pattern.frequency >= 10)) {
                    if (pattern.suggestedKnowledgeEntry) {
                        const confidence = this.calculateSuggestionConfidence(pattern);
                        suggestions.push({
                            ...pattern.suggestedKnowledgeEntry,
                            confidence,
                            frequency: pattern.frequency,
                            reasoning: this.generateSuggestionReasoning(pattern)
                        });
                    }
                }
            }
            // Ordenar por confianza y frecuencia
            suggestions.sort((a, b) => (b.confidence * b.frequency) - (a.confidence * a.frequency));
            logger_1.logger.info(`💡 Generated ${suggestions.length} knowledge base suggestions`);
            return suggestions.slice(0, 10); // Limitar a 10 sugerencias más relevantes
        }
        catch (error) {
            logger_1.logger.error('Error generating knowledge base suggestions:', error);
            return [];
        }
    }
    /**
     * Obtiene insights de aprendizaje completos
     */
    async getLearningInsights() {
        try {
            logger_1.logger.info('📊 Generating comprehensive learning insights');
            const interactions = await DatabaseService_1.default.getTrainingInteractions(1000);
            const patterns = await this.analyzeFrequentPatterns(20);
            const suggestions = await this.suggestKnowledgeBaseEntries();
            // Calcular métricas de performance
            const performanceMetrics = this.calculatePerformanceMetrics(interactions);
            const insights = {
                totalInteractions: interactions.length,
                averageSuccessScore: interactions.length > 0
                    ? interactions.reduce((sum, i) => sum + i.successScore, 0) / interactions.length
                    : 0,
                mostFrequentPatterns: patterns,
                suggestedKnowledgeEntries: suggestions,
                performanceMetrics
            };
            logger_1.logger.info('📊 Learning insights generated successfully', {
                totalInteractions: insights.totalInteractions,
                avgSuccess: insights.averageSuccessScore.toFixed(3),
                patterns: patterns.length,
                suggestions: suggestions.length
            });
            return insights;
        }
        catch (error) {
            logger_1.logger.error('Error generating learning insights:', error);
            // Return empty insights on error
            return {
                totalInteractions: 0,
                averageSuccessScore: 0,
                mostFrequentPatterns: [],
                suggestedKnowledgeEntries: [],
                performanceMetrics: {
                    responseAccuracy: 0,
                    userSatisfaction: 0,
                    knowledgeBaseUtilization: 0,
                    conversationCompletionRate: 0
                }
            };
        }
    }
    /**
     * Actualiza automáticamente la knowledge base con sugerencias aprobadas
     */
    async autoUpdateKnowledgeBase(confidence = 0.8, frequency = 5) {
        try {
            logger_1.logger.info(`🔄 Auto-updating knowledge base (confidence >= ${confidence}, frequency >= ${frequency})`);
            const suggestions = await this.suggestKnowledgeBaseEntries();
            let addedEntries = 0;
            for (const suggestion of suggestions) {
                if (suggestion.confidence >= confidence && suggestion.frequency >= frequency) {
                    // Verificar que no exista ya una entrada similar
                    const existingEntries = await DatabaseService_1.default.searchKnowledgeBase(suggestion.title);
                    if (existingEntries.length === 0) {
                        const success = await DatabaseService_1.default.addKnowledgeBase({
                            title: suggestion.title,
                            content: suggestion.content,
                            keywords: suggestion.keywords.join(', '),
                            category: suggestion.category,
                            priority: 'medium',
                            isActive: true,
                            source: 'auto_learning',
                            metadata: {
                                autoGenerated: true,
                                confidence: suggestion.confidence,
                                frequency: suggestion.frequency,
                                reasoning: suggestion.reasoning,
                                generatedAt: new Date().toISOString()
                            }
                        });
                        if (success) {
                            addedEntries++;
                            logger_1.logger.info(`✅ Auto-added knowledge entry: "${suggestion.title}" (confidence: ${suggestion.confidence.toFixed(3)})`);
                        }
                    }
                    else {
                        logger_1.logger.debug(`⏭️ Skipping similar entry: "${suggestion.title}"`);
                    }
                }
            }
            logger_1.logger.info(`🎉 Auto-update completed. Added ${addedEntries} new knowledge base entries`);
        }
        catch (error) {
            logger_1.logger.error('Error in auto knowledge base update:', error);
        }
    }
    // ============================================
    // MÉTODOS AUXILIARES
    // ============================================
    async analyzePatternAsync(userMessage, successScore) {
        try {
            // Extraer patrones clave del mensaje
            const patterns = this.extractMessagePatterns(userMessage);
            for (const pattern of patterns) {
                const existingPattern = this.patternCache.get(pattern);
                if (existingPattern) {
                    // Actualizar patrón existente
                    existingPattern.frequency += 1;
                    existingPattern.averageSuccessScore =
                        (existingPattern.averageSuccessScore * (existingPattern.frequency - 1) + successScore) /
                            existingPattern.frequency;
                    existingPattern.lastSeen = new Date();
                }
                else {
                    // Nuevo patrón
                    this.patternCache.set(pattern, {
                        pattern,
                        frequency: 1,
                        averageSuccessScore: successScore,
                        lastSeen: new Date()
                    });
                }
            }
            logger_1.logger.debug(`📝 Updated ${patterns.length} patterns in cache`);
        }
        catch (error) {
            logger_1.logger.error('Error in async pattern analysis:', error);
        }
    }
    extractMessagePatterns(message) {
        const patterns = [];
        const normalizedMessage = message.toLowerCase().trim();
        // Extraer patrones de palabras clave
        const keywords = normalizedMessage.split(/\s+/).filter(word => word.length > 3);
        // Patrones de 1 palabra (sustantivos importantes)
        const importantWords = keywords.filter(word => ['precio', 'servicio', 'información', 'horario', 'ubicación', 'contacto', 'ayuda', 'soporte'].includes(word));
        patterns.push(...importantWords);
        // Patrones de 2 palabras
        for (let i = 0; i < keywords.length - 1; i++) {
            const bigram = `${keywords[i]} ${keywords[i + 1]}`;
            patterns.push(bigram);
        }
        // Patrones de preguntas
        if (normalizedMessage.includes('?') || normalizedMessage.includes('cuánto') || normalizedMessage.includes('cómo')) {
            patterns.push('pregunta_directa');
        }
        // Patrones de saludo
        if (['hola', 'buenos', 'buenas'].some(greeting => normalizedMessage.includes(greeting))) {
            patterns.push('saludo');
        }
        // Patrones de urgencia
        if (['urgente', 'ya', 'ahora', 'rápido'].some(urgent => normalizedMessage.includes(urgent))) {
            patterns.push('urgente');
        }
        return [...new Set(patterns)]; // Remove duplicates
    }
    groupSimilarMessages(interactions) {
        const groups = new Map();
        for (const interaction of interactions) {
            const patterns = this.extractMessagePatterns(interaction.userMessage);
            for (const pattern of patterns) {
                if (!groups.has(pattern)) {
                    groups.set(pattern, []);
                }
                groups.get(pattern).push(interaction);
            }
        }
        return groups;
    }
    async generateKnowledgeEntrySuggestion(pattern, interactions) {
        try {
            // Si el patrón tiene muy buena puntuación, no necesita mejora
            const avgScore = interactions.reduce((sum, i) => sum + i.successScore, 0) / interactions.length;
            if (avgScore > 0.8) {
                return undefined;
            }
            // Analizar el contexto de las interacciones para generar sugerencia
            const commonIntents = this.extractCommonIntents(interactions);
            const commonKeywords = this.extractCommonKeywords(interactions);
            const category = this.categorizePattern(pattern, commonIntents);
            if (category === 'unknown') {
                return undefined;
            }
            const suggestion = {
                title: this.generateTitle(pattern, category),
                content: await this.generateContent(pattern, interactions, category),
                keywords: commonKeywords,
                category
            };
            return suggestion;
        }
        catch (error) {
            logger_1.logger.error('Error generating knowledge entry suggestion:', error);
            return undefined;
        }
    }
    extractCommonIntents(interactions) {
        const intents = interactions
            .map(i => i.contextData.intent)
            .filter(intent => intent && intent !== 'unknown');
        const intentCounts = new Map();
        intents.forEach(intent => {
            intentCounts.set(intent, (intentCounts.get(intent) || 0) + 1);
        });
        return Array.from(intentCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([intent]) => intent)
            .slice(0, 3);
    }
    extractCommonKeywords(interactions) {
        const allMessages = interactions.map(i => i.userMessage).join(' ');
        const words = allMessages.toLowerCase().split(/\s+/);
        const wordCounts = new Map();
        words.forEach(word => {
            if (word.length > 3 && !['para', 'esto', 'esta', 'desde', 'hasta', 'como'].includes(word)) {
                wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
            }
        });
        return Array.from(wordCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([word]) => word);
    }
    categorizePattern(pattern, intents) {
        // Categorizar basado en el patrón y las intenciones comunes
        if (pattern.includes('precio') || pattern.includes('costo') || pattern.includes('cuánto')) {
            return 'pricing';
        }
        if (pattern.includes('servicio') || pattern.includes('producto')) {
            return 'services';
        }
        if (pattern.includes('horario') || pattern.includes('tiempo')) {
            return 'schedule';
        }
        if (pattern.includes('ubicación') || pattern.includes('dirección') || pattern.includes('dónde')) {
            return 'location';
        }
        if (pattern.includes('contacto') || pattern.includes('teléfono')) {
            return 'contact';
        }
        if (intents.includes('greeting') || intents.includes('saludo')) {
            return 'greetings';
        }
        if (intents.includes('complaint') || intents.includes('queja')) {
            return 'support';
        }
        return 'general';
    }
    generateTitle(pattern, category) {
        const categoryTitles = {
            'pricing': `Información sobre ${pattern}`,
            'services': `Detalles del servicio de ${pattern}`,
            'schedule': `Horarios para ${pattern}`,
            'location': `Ubicación y ${pattern}`,
            'contact': `Contacto para ${pattern}`,
            'greetings': `Respuesta a ${pattern}`,
            'support': `Soporte para ${pattern}`,
            'general': `Información general sobre ${pattern}`
        };
        return categoryTitles[category] || `Información sobre ${pattern}`;
    }
    async generateContent(pattern, interactions, category) {
        // Generar contenido basado en las respuestas exitosas
        const successfulInteractions = interactions.filter(i => i.successScore > 0.7);
        if (successfulInteractions.length === 0) {
            return `Información detallada sobre ${pattern} que aborda las consultas frecuentes de los usuarios.`;
        }
        // Analizar respuestas exitosas para extraer patrones
        const commonResponses = successfulInteractions.map(i => i.aiResponse);
        const commonPhrases = this.extractCommonPhrases(commonResponses);
        return `${commonPhrases.slice(0, 3).join(' ')} Para más información específica sobre ${pattern}, un especialista podrá ayudarte con todos los detalles.`;
    }
    extractCommonPhrases(responses) {
        // Simplificado: extraer frases comunes de las respuestas exitosas
        const allText = responses.join(' ').toLowerCase();
        const sentences = allText.split(/[.!?]+/).filter(s => s.trim().length > 10);
        const sentenceCounts = new Map();
        sentences.forEach(sentence => {
            const normalized = sentence.trim();
            sentenceCounts.set(normalized, (sentenceCounts.get(normalized) || 0) + 1);
        });
        return Array.from(sentenceCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([sentence]) => sentence);
    }
    calculateSuggestionConfidence(pattern) {
        let confidence = 0.5; // Base
        // Mayor frecuencia = mayor confianza
        if (pattern.frequency >= 10)
            confidence += 0.3;
        else if (pattern.frequency >= 5)
            confidence += 0.2;
        else if (pattern.frequency >= 3)
            confidence += 0.1;
        // Menor score promedio = mayor necesidad de mejora
        if (pattern.averageSuccessScore < 0.5)
            confidence += 0.3;
        else if (pattern.averageSuccessScore < 0.7)
            confidence += 0.2;
        // Recency factor
        const daysSinceLastSeen = (Date.now() - pattern.lastSeen.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceLastSeen < 7)
            confidence += 0.1;
        return Math.min(confidence, 1.0);
    }
    generateSuggestionReasoning(pattern) {
        const reasons = [];
        if (pattern.frequency >= 10) {
            reasons.push('Patrón muy frecuente');
        }
        else if (pattern.frequency >= 5) {
            reasons.push('Patrón frecuente');
        }
        if (pattern.averageSuccessScore < 0.5) {
            reasons.push('Baja satisfacción del usuario');
        }
        else if (pattern.averageSuccessScore < 0.7) {
            reasons.push('Satisfacción mejorable');
        }
        const daysSince = (Date.now() - pattern.lastSeen.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince < 7) {
            reasons.push('Consulta reciente');
        }
        return reasons.join(', ');
    }
    calculatePerformanceMetrics(interactions) {
        if (interactions.length === 0) {
            return {
                responseAccuracy: 0,
                userSatisfaction: 0,
                knowledgeBaseUtilization: 0,
                conversationCompletionRate: 0
            };
        }
        // Calcular métricas
        const avgSuccessScore = interactions.reduce((sum, i) => sum + i.successScore, 0) / interactions.length;
        const conversationsContinued = interactions.filter(i => i.feedbackMetrics.conversationContinued).length;
        const knowledgeBaseUsed = interactions.filter(i => i.knowledgeBaseIdsUsed.length > 0).length;
        const userSatisfactionIndicators = interactions.reduce((sum, i) => sum + i.feedbackMetrics.userSatisfactionIndicators.length, 0) / interactions.length;
        return {
            responseAccuracy: avgSuccessScore,
            userSatisfaction: userSatisfactionIndicators / 3, // Normalize assuming max 3 indicators
            knowledgeBaseUtilization: knowledgeBaseUsed / interactions.length,
            conversationCompletionRate: conversationsContinued / interactions.length
        };
    }
    shouldUseCache() {
        return Date.now() - this.lastCacheUpdate < this.CACHE_DURATION;
    }
    updatePatternCache(patterns) {
        this.patternCache.clear();
        patterns.forEach(pattern => {
            this.patternCache.set(pattern.pattern, pattern);
        });
        this.lastCacheUpdate = Date.now();
    }
    // ============================================
    // MÉTODOS DE OPTIMIZACIÓN CONTINUA
    // ============================================
    /**
     * Identifica oportunidades de mejora en las respuestas
     */
    async identifyImprovementOpportunities() {
        try {
            const patterns = await this.analyzeFrequentPatterns(30);
            const opportunities = [];
            for (const pattern of patterns) {
                if (pattern.frequency >= 3 && pattern.averageSuccessScore < 0.8) {
                    const potentialImprovement = 1.0 - pattern.averageSuccessScore;
                    const priority = this.determinePriority(pattern.frequency, pattern.averageSuccessScore);
                    opportunities.push({
                        pattern: pattern.pattern,
                        currentScore: pattern.averageSuccessScore,
                        potentialImprovement,
                        suggestion: this.generateImprovementSuggestion(pattern),
                        priority
                    });
                }
            }
            return opportunities.sort((a, b) => this.getPriorityWeight(b.priority) * b.potentialImprovement -
                this.getPriorityWeight(a.priority) * a.potentialImprovement);
        }
        catch (error) {
            logger_1.logger.error('Error identifying improvement opportunities:', error);
            return [];
        }
    }
    determinePriority(frequency, avgScore) {
        if (frequency >= 10 && avgScore < 0.6)
            return 'high';
        if (frequency >= 5 && avgScore < 0.7)
            return 'high';
        if (frequency >= 3 && avgScore < 0.5)
            return 'high';
        if (frequency >= 10 || avgScore < 0.6)
            return 'medium';
        return 'low';
    }
    getPriorityWeight(priority) {
        const weights = { high: 3, medium: 2, low: 1 };
        return weights[priority];
    }
    generateImprovementSuggestion(pattern) {
        if (pattern.averageSuccessScore < 0.5) {
            return `Crear respuesta específica para "${pattern.pattern}" - Score actual muy bajo (${(pattern.averageSuccessScore * 100).toFixed(1)}%)`;
        }
        if (pattern.frequency >= 10) {
            return `Optimizar respuesta para "${pattern.pattern}" - Consulta muy frecuente (${pattern.frequency} veces)`;
        }
        return `Mejorar respuesta para "${pattern.pattern}" - Oportunidad de optimización identificada`;
    }
}
// Exportar instancia singleton
exports.default = AILearningService.getInstance();
