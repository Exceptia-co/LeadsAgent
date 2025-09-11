# Practical Examples & Troubleshooting - LeadsCRM

## 🛠️ Ejemplos Prácticos y Code Snippets

Esta documentación proporciona ejemplos prácticos para trabajar con el sistema LeadsCRM.

## 🤖 Ejemplos de IA para Clasificación de Leads

### Ejemplo 1: Clasificación Básica
```typescript
// apps/whatsapp-service/src/services/AIService.ts

import AIService from './AIService';

// Ejemplo de clasificación de lead
async function classifyLead(message: string, phoneNumber: string) {
  try {
    // Análisis de intención
    const intentAnalysis = await AIService.analyzeIntent(message);
    
    console.log('Intent Analysis:', {
      intent: intentAnalysis.intent,
      confidence: intentAnalysis.confidence,
      sentiment: intentAnalysis.sentiment,
      entities: intentAnalysis.entities
    });
    
    // Generar respuesta contextual
    const response = await AIService.generateResponse(message, {
      from: phoneNumber,
      sessionId: 'default',
      phoneNumber: phoneNumber
    });
    
    return {
      classification: intentAnalysis,
      suggestedResponse: response.content,
      leadScore: calculateLeadScore(intentAnalysis)
    };
    
  } catch (error) {
    console.error('Error in lead classification:', error);
    return {
      classification: { intent: 'general', confidence: 0.0 },
      suggestedResponse: 'Gracias por tu mensaje. Un agente se pondrá en contacto contigo pronto.',
      leadScore: 0.3
    };
  }
}

function calculateLeadScore(analysis: any): number {
  let score = 0.3; // Base score
  
  // Increase score based on intent
  switch (analysis.intent) {
    case 'purchase_intent':
      score += 0.4;
      break;
    case 'consulta_producto':
      score += 0.3;
      break;
    case 'solicitar_info':
      score += 0.2;
      break;
    case 'saludo':
      score += 0.1;
      break;
  }
  
  // Adjust by confidence
  score *= analysis.confidence;
  
  // Cap at 1.0
  return Math.min(score, 1.0);
}

// Ejemplo de uso
classifyLead("Hola, me interesa comprar su producto urgentemente", "+34123456789")
  .then(result => console.log('Result:', result));
```

### Ejemplo 2: Cambio de Proveedor IA
```typescript
// Cambiar proveedor de IA dinámicamente
async function switchAIProvider(newProvider: 'openrouter' | 'gemini') {
  try {
    const response = await fetch('http://localhost:3002/ai/switch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ provider: newProvider })
    });
    
    const result = await response.json();
    
    if (result.success) {
      console.log(`✅ Successfully switched to ${newProvider}`);
      console.log(`Current provider: ${result.currentProvider}`);
      return true;
    } else {
      console.error(`❌ Failed to switch: ${result.error}`);
      return false;
    }
  } catch (error) {
    console.error('Error switching provider:', error);
    return false;
  }
}

// Test AI provider
async function testAIProvider(message: string = "Test message") {
  try {
    const response = await fetch('http://localhost:3002/ai/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message })
    });
    
    const result = await response.json();
    
    if (result.success) {
      console.log('✅ AI Test successful:');
      console.log('Provider:', result.data.provider);
      console.log('Response:', result.data.content);
      console.log('Tokens used:', result.data.tokensUsed);
    } else {
      console.error('❌ AI Test failed:', result.error);
    }
    
    return result;
  } catch (error) {
    console.error('Error testing AI:', error);
    return { success: false, error: error.message };
  }
}

// Ejemplo de uso con fallback
async function robustAITest() {
  console.log('Testing OpenRouter...');
  await switchAIProvider('openrouter');
  let result = await testAIProvider("¿Cuánto cuesta su producto?");
  
  if (!result.success) {
    console.log('OpenRouter failed, trying Gemini...');
    await switchAIProvider('gemini');
    result = await testAIProvider("¿Cuánto cuesta su producto?");
  }
  
  return result;
}
```

## 📱 Ejemplos de WhatsApp Integration

### Ejemplo 3: Gestión de Sesiones
```typescript
// Crear nueva sesión de WhatsApp
async function createWhatsAppSession(sessionId: string) {
  try {
    const response = await fetch('http://localhost:3002/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId })
    });
    
    const result = await response.json();
    
    if (result.success) {
      console.log(`✅ Session ${sessionId} created successfully`);
      console.log('Status:', result.data.status);
      
      // Polling para obtener QR code
      await pollForQRCode(sessionId);
    } else {
      console.error(`❌ Failed to create session: ${result.error}`);
    }
    
    return result;
  } catch (error) {
    console.error('Error creating session:', error);
    return { success: false, error: error.message };
  }
}

async function pollForQRCode(sessionId: string, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`http://localhost:3002/sessions/${sessionId}/qr`);
      const result = await response.json();
      
      if (result.success && result.data.qrCode) {
        console.log('📱 QR Code available! Scan with WhatsApp mobile app');
        console.log('QR Code:', result.data.qrCode);
        return result.data.qrCode;
      }
      
      // Wait 2 seconds before next attempt
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`Attempt ${i + 1} failed:`, error.message);
    }
  }
  
  throw new Error('QR code not available after maximum attempts');
}

// Enviar mensaje
async function sendWhatsAppMessage(sessionId: string, to: string, message: string) {
  try {
    const response = await fetch(`http://localhost:3002/sessions/${sessionId}/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: to,
        message: message
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      console.log(`✅ Message sent to ${to}`);
      console.log('Message ID:', result.data.messageId);
    } else {
      console.error(`❌ Failed to send message: ${result.error}`);
    }
    
    return result;
  } catch (error) {
    console.error('Error sending message:', error);
    return { success: false, error: error.message };
  }
}
```

### Ejemplo 4: Monitoreo de Estadísticas
```typescript
// Obtener estadísticas del servicio WhatsApp
async function getWhatsAppStats() {
  try {
    const response = await fetch('http://localhost:3002/stats');
    const stats = await response.json();
    
    if (stats.success) {
      console.log('📊 WhatsApp Service Statistics:');
      console.log('Active Sessions:', stats.activeSessions);
      console.log('Total Messages:', stats.totalMessages);
      console.log('Messages Today:', stats.messagesToday);
      console.log('Response Rate:', stats.responseRate + '%');
      
      // Log individual session stats
      if (stats.sessionStats) {
        console.log('\n📱 Session Details:');
        stats.sessionStats.forEach(session => {
          console.log(`  ${session.sessionId}:`);
          console.log(`    Status: ${session.status}`);
          console.log(`    Messages: ${session.messageCount}`);
          console.log(`    Last Active: ${session.lastActivity}`);
        });
      }
    }
    
    return stats;
  } catch (error) {
    console.error('Error fetching stats:', error);
    return { success: false, error: error.message };
  }
}

// Obtener logs de whitelist
async function getWhitelistLogs(filters = {}) {
  try {
    const queryParams = new URLSearchParams(filters);
    const response = await fetch(`http://localhost:3002/logs/whitelist?${queryParams}`);
    const logs = await response.json();
    
    if (logs.success) {
      console.log('📝 Whitelist Logs:');
      logs.data.forEach(log => {
        console.log(`${log.timestamp}: ${log.phoneNumber} - ${log.decision} (${log.reason})`);
      });
    }
    
    return logs;
  } catch (error) {
    console.error('Error fetching logs:', error);
    return { success: false, error: error.message };
  }
}
```

## 🔧 Ejemplos de Reglas de Automatización

### Ejemplo 5: Regla Personalizada
```typescript
// Crear regla de automatización personalizada
const customAutoRule = {
  id: 'custom_product_inquiry',
  name: 'Consulta Producto Específico',
  trigger: 'keyword',
  conditions: {
    keywords: ['smartphone', 'móvil', 'teléfono', 'iphone', 'android'],
    confidence_threshold: 0.7,
    priority: 2
  },
  response: {
    message: `📱 ¡Excelente elección! Tenemos una gran variedad de smartphones disponibles.

¿Podrías decirme:
• ¿Qué presupuesto tienes en mente?
• ¿Prefieres iOS o Android?
• ¿Para qué lo vas a usar principalmente?

Un especialista en móviles te ayudará a encontrar el perfecto para ti. 😊`,
    type: 'text',
    delay: 3
  },
  isActive: true,
  
  // Función personalizada de procesamiento
  async process(lead: any, message: string, sessionId: string) {
    try {
      // Log the trigger
      console.log(`🤖 Triggered custom rule for lead ${lead.id}`);
      
      // Update lead with specific tags
      await updateLeadTags(lead.id, ['smartphone_interest', 'tech_product']);
      
      // Increase lead score due to specific product interest
      await updateLeadScore(lead.id, Math.min(lead.moodScore + 0.2, 1.0));
      
      // Schedule follow-up after 24 hours if no response
      await scheduleFollowUp(lead.id, '24h', 'smartphone_followup');
      
      return {
        processed: true,
        actions: ['tagged', 'scored', 'scheduled_followup']
      };
    } catch (error) {
      console.error('Error processing custom rule:', error);
      return { processed: false, error: error.message };
    }
  }
};

// Funciones auxiliares
async function updateLeadTags(leadId: string, tags: string[]) {
  // Implementation depends on your database service
  console.log(`Updating lead ${leadId} with tags:`, tags);
}

async function updateLeadScore(leadId: string, newScore: number) {
  console.log(`Updating lead ${leadId} score to:`, newScore);
}

async function scheduleFollowUp(leadId: string, delay: string, type: string) {
  console.log(`Scheduled ${type} follow-up for lead ${leadId} in ${delay}`);
}
```

### Ejemplo 6: Sistema de Scoring Avanzado
```typescript
// Sistema de scoring basado en múltiples factores
class LeadScoringEngine {
  private keywordWeights = {
    urgency: ['urgente', 'ya', 'inmediato', 'hoy', 'ahora'],
    purchase: ['comprar', 'adquirir', 'contratar', 'necesito'],
    budget: ['presupuesto', 'precio', 'coste', 'cuánto'],
    timeline: ['cuándo', 'fecha', 'tiempo', 'plazo'],
    business: ['empresa', 'negocio', 'comercial', 'profesional']
  };
  
  public calculateScore(message: string, context: any = {}): number {
    let score = 0.3; // Base score
    const lowerMessage = message.toLowerCase();
    
    // Keyword analysis
    Object.entries(this.keywordWeights).forEach(([category, keywords]) => {
      const matches = keywords.filter(keyword => lowerMessage.includes(keyword)).length;
      if (matches > 0) {
        switch (category) {
          case 'urgency':
            score += matches * 0.15;
            break;
          case 'purchase':
            score += matches * 0.20;
            break;
          case 'budget':
            score += matches * 0.10;
            break;
          case 'timeline':
            score += matches * 0.08;
            break;
          case 'business':
            score += matches * 0.12;
            break;
        }
      }
    });
    
    // Message length factor (longer = more engaged)
    const lengthFactor = Math.min(message.length / 100, 0.1);
    score += lengthFactor;
    
    // Question count (questions = interest)
    const questionCount = (message.match(/\?/g) || []).length;
    score += questionCount * 0.05;
    
    // Contact information provided
    if (this.hasContactInfo(message)) {
      score += 0.15;
    }
    
    // Time of day factor (business hours = higher score)
    const hour = new Date().getHours();
    if (hour >= 9 && hour <= 17) {
      score += 0.05;
    }
    
    // Repeat customer
    if (context.isRepeatCustomer) {
      score += 0.1;
    }
    
    return Math.min(score, 1.0);
  }
  
  private hasContactInfo(message: string): boolean {
    // Simple regex patterns for email and phone
    const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
    const phonePattern = /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/;
    
    return emailPattern.test(message) || phonePattern.test(message);
  }
  
  public getScoreExplanation(message: string): string {
    const score = this.calculateScore(message);
    
    if (score >= 0.8) {
      return "🔥 Lead muy caliente - Contactar inmediatamente";
    } else if (score >= 0.6) {
      return "🌡️ Lead templado - Seguimiento dentro de 24h";
    } else if (score >= 0.4) {
      return "❄️ Lead frío - Nurturing campaign";
    } else {
      return "🧊 Lead muy frío - Monitorear sin acción";
    }
  }
}

// Ejemplo de uso
const scorer = new LeadScoringEngine();
const message = "Hola, necesito comprar urgentemente su producto para mi empresa. ¿Cuánto cuesta y cuándo pueden entregarlo? Mi email es cliente@empresa.com";
const score = scorer.calculateScore(message, { isRepeatCustomer: false });
const explanation = scorer.getScoreExplanation(message);

console.log(`Score: ${score.toFixed(2)}`);
console.log(`Explanation: ${explanation}`);
```

## 🔍 Troubleshooting Examples

### Problema 1: AI Service No Responde
```typescript
// Diagnóstico de problemas de AI Service
async function diagnoseAIService() {
  console.log('🔍 Diagnosing AI Service...');
  
  // Check AI service status
  try {
    const statusResponse = await fetch('http://localhost:3002/ai/status');
    const status = await statusResponse.json();
    
    console.log('📊 AI Service Status:');
    console.log('  OpenRouter:', status.data.openrouter ? '✅' : '❌');
    console.log('  Gemini:', status.data.gemini ? '✅' : '❌');
    console.log('  Current Provider:', status.data.currentProvider);
    
    if (!status.data.openrouter && !status.data.gemini) {
      console.log('❌ No AI providers available! Check API keys.');
      return false;
    }
    
    // Test both providers
    await testProvider('openrouter');
    await testProvider('gemini');
    
    return true;
  } catch (error) {
    console.error('❌ Failed to connect to AI service:', error.message);
    console.log('💡 Solutions:');
    console.log('  1. Check if whatsapp-service is running on port 3002');
    console.log('  2. Verify environment variables are set correctly');
    console.log('  3. Check network connectivity');
    return false;
  }
}

async function testProvider(provider: 'openrouter' | 'gemini') {
  try {
    await switchAIProvider(provider);
    const result = await testAIProvider(`Test message for ${provider}`);
    
    if (result.success) {
      console.log(`✅ ${provider} working correctly`);
    } else {
      console.log(`❌ ${provider} failed: ${result.error}`);
      console.log(`💡 Check ${provider.toUpperCase()}_API_KEY in environment variables`);
    }
  } catch (error) {
    console.log(`❌ ${provider} test failed: ${error.message}`);
  }
}
```

### Problema 2: WhatsApp Session Issues
```typescript
// Troubleshoot WhatsApp session problems
async function troubleshootWhatsAppSession(sessionId: string) {
  console.log(`🔧 Troubleshooting WhatsApp session: ${sessionId}`);
  
  try {
    // Check session status
    const statusResponse = await fetch(`http://localhost:3002/sessions/${sessionId}/status`);
    const status = await statusResponse.json();
    
    console.log('📱 Session Status:', status.data?.status || 'Unknown');
    
    switch (status.data?.status) {
      case 'connecting':
        console.log('⏳ Session is connecting...');
        console.log('💡 Solution: Wait for QR code generation or check for QR code');
        await pollForQRCode(sessionId, 10);
        break;
        
      case 'auth_failure':
        console.log('❌ Authentication failed');
        console.log('💡 Solutions:');
        console.log('  1. Delete session and create new one');
        console.log('  2. Clear session data from ./sessions directory');
        console.log('  3. Scan QR code again');
        await recreateSession(sessionId);
        break;
        
      case 'disconnected':
        console.log('📴 Session disconnected');
        console.log('💡 Solutions:');
        console.log('  1. Restart session');
        console.log('  2. Check internet connection');
        console.log('  3. Verify WhatsApp mobile app is active');
        await restartSession(sessionId);
        break;
        
      case 'ready':
        console.log('✅ Session is healthy');
        // Test message sending
        console.log('🧪 Testing message sending...');
        await testMessageSending(sessionId);
        break;
        
      default:
        console.log('❓ Unknown session status');
        console.log('💡 Try restarting the session');
    }
    
  } catch (error) {
    console.error('❌ Failed to check session status:', error.message);
    console.log('💡 Solutions:');
    console.log('  1. Check if whatsapp-service is running');
    console.log('  2. Verify session exists');
    console.log('  3. Check service logs for errors');
  }
}

async function recreateSession(sessionId: string) {
  console.log(`🔄 Recreating session ${sessionId}...`);
  
  // Delete existing session
  try {
    await fetch(`http://localhost:3002/sessions/${sessionId}`, { method: 'DELETE' });
    console.log('🗑️ Old session deleted');
  } catch (error) {
    console.log('⚠️ Could not delete old session:', error.message);
  }
  
  // Wait a moment
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Create new session
  await createWhatsAppSession(sessionId);
}

async function testMessageSending(sessionId: string) {
  // Use a test number or your own number
  const testNumber = process.env.TEST_PHONE_NUMBER || '+34123456789';
  const testMessage = '🧪 Test message from LeadsCRM system';
  
  try {
    const result = await sendWhatsAppMessage(sessionId, testNumber, testMessage);
    if (result.success) {
      console.log('✅ Message sending test successful');
    } else {
      console.log('❌ Message sending failed:', result.error);
    }
  } catch (error) {
    console.log('❌ Message test error:', error.message);
  }
}
```

### Problema 3: Database Connection Issues
```bash
# Script de troubleshooting para base de datos
echo "🔍 Diagnosing database connection..."

# Check if database is accessible
echo "📊 Testing database connection..."
pnpm db:studio --browser=none &
STUDIO_PID=$!
sleep 3

if kill -0 $STUDIO_PID 2>/dev/null; then
  echo "✅ Database connection successful"
  kill $STUDIO_PID
else
  echo "❌ Database connection failed"
  echo "💡 Solutions:"
  echo "  1. Check DATABASE_URL in .env file"
  echo "  2. Verify database server is running"
  echo "  3. Check network connectivity to database"
  echo "  4. Verify database credentials"
fi

# Check migrations status
echo "🔄 Checking migration status..."
pnpm db:migrate:status

# Test query execution
echo "🧪 Testing query execution..."
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

prisma.\$queryRaw\`SELECT 1 as test\`
  .then(result => {
    console.log('✅ Query execution successful:', result);
    process.exit(0);
  })
  .catch(error => {
    console.log('❌ Query execution failed:', error.message);
    process.exit(1);
  })
  .finally(() => prisma.\$disconnect());
"
```

### Problema 4: Performance Issues
```typescript
// Monitor performance and identify bottlenecks
class PerformanceMonitor {
  private metrics: Map<string, number[]> = new Map();
  
  public startTimer(operation: string): () => number {
    const start = Date.now();
    
    return () => {
      const duration = Date.now() - start;
      this.recordMetric(operation, duration);
      return duration;
    };
  }
  
  private recordMetric(operation: string, duration: number) {
    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, []);
    }
    
    const metrics = this.metrics.get(operation)!;
    metrics.push(duration);
    
    // Keep only last 100 measurements
    if (metrics.length > 100) {
      metrics.shift();
    }
  }
  
  public getStats(operation: string) {
    const metrics = this.metrics.get(operation);
    if (!metrics || metrics.length === 0) {
      return null;
    }
    
    const avg = metrics.reduce((a, b) => a + b, 0) / metrics.length;
    const min = Math.min(...metrics);
    const max = Math.max(...metrics);
    const p95 = metrics.sort((a, b) => a - b)[Math.floor(metrics.length * 0.95)];
    
    return { avg, min, max, p95, count: metrics.length };
  }
  
  public printAllStats() {
    console.log('📊 Performance Statistics:');
    this.metrics.forEach((_, operation) => {
      const stats = this.getStats(operation);
      if (stats) {
        console.log(`  ${operation}:`);
        console.log(`    Average: ${stats.avg.toFixed(2)}ms`);
        console.log(`    Min: ${stats.min}ms, Max: ${stats.max}ms`);
        console.log(`    P95: ${stats.p95}ms`);
        console.log(`    Samples: ${stats.count}`);
        
        // Performance alerts
        if (stats.avg > 5000) {
          console.log(`    ⚠️ SLOW: Average response time > 5 seconds`);
        }
        if (stats.p95 > 10000) {
          console.log(`    🚨 CRITICAL: P95 response time > 10 seconds`);
        }
      }
    });
  }
}

// Usage example
const monitor = new PerformanceMonitor();

async function monitoredAIRequest(message: string) {
  const timer = monitor.startTimer('ai_request');
  
  try {
    const result = await testAIProvider(message);
    const duration = timer();
    
    console.log(`⏱️ AI request completed in ${duration}ms`);
    
    if (duration > 5000) {
      console.log('⚠️ Slow AI response detected. Consider:');
      console.log('  1. Switching to faster provider');
      console.log('  2. Reducing prompt complexity');
      console.log('  3. Implementing caching');
    }
    
    return result;
  } catch (error) {
    timer(); // Still record the time
    throw error;
  }
}

// Regular performance check
setInterval(() => {
  monitor.printAllStats();
}, 300000); // Every 5 minutes
```

Estos ejemplos proporcionan una base sólida para trabajar con el sistema LeadsCRM, desde la integración básica hasta troubleshooting avanzado.
