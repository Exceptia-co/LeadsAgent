const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

async function setupAIConfig() {
  try {
    console.log('🤖 Setting up AI configuration...');

    const configs = [
      {
        key: 'system_prompt',
        value: `Eres un asistente virtual de EscortsHub.net. Tu misión es ayudar de manera BREVE, NATURAL y CONVERSACIONAL.

🎯 **REGLAS DE RESPUESTA:**
- MÁXIMO 60 palabras por respuesta
- Mensaje WhatsApp natural, sin listas largas
- SIEMPRE terminar con una pregunta
- Sin tablas ni secciones múltiples

📱 **RESPUESTAS TIPO:**

**SALUDO:**
"¡Hola! 👋 Soy tu asistente de EscortsHub.net. ¿En qué puedo ayudarte?"
(Máximo 15 palabras)

**PRECIO:**
"Paquete Plus: 500 HUB por 300€ (0,60€/moneda) = mejor precio. Anuncio TOP 30 días: 450 HUB. ¿Te interesa?"
(Máximo 30 palabras)

**REGISTRO:**
"Registro GRATUITO en https://www.escortshub.net/es/sign-up. Solo pagas productos que actives. ¿Te ayudo?"
(Máximo 20 palabras)

🚫 **PROHIBIDO:**
- Listas largas de precios
- Tablas extensas
- Más de 60 palabras
- Múltiples secciones
- Información no solicitada

✅ **INFO CLAVE:**
- EscortsHub.net - Plataforma líder
- Monedas HUB (0,60€ cada una con Paquete Plus)
- Registro GRATUITO
- Soporte 24/7`,
        description: 'Prompt principal del sistema de IA con instrucciones completas'
      },
      {
        key: 'greeting_response',
        value: `¡Hola! 👋 Soy tu asistente de EscortsHub.net. ¿En qué puedo ayudarte hoy?`,
        description: 'Respuesta automática breve para saludos (máximo 15 palabras)'
      },
      {
        key: 'minimum_confidence_threshold',
        value: '0.3',
        description: 'Umbral mínimo de confianza para responder (0.0-1.0)'
      },
      {
        key: 'greeting_keywords',
        value: 'hola,hi,buenas,buenos,saludos,hey,hello,que tal,como estas,buenas tardes,buenas noches,buenos dias',
        description: 'Keywords que identifican saludos simples'
      },
      {
        key: 'always_respond_patterns',
        value: 'hola,hi,buenas,buenos,saludos,hey,hello,que tal,precio,precios,producto,productos,registro,registrarse,monedas,hub,escortshub',
        description: 'Patrones que siempre deben generar respuesta, independiente del knowledge base'
      },
      {
        key: 'response_length_limits',
        value: JSON.stringify({
          greeting: 15,
          pricing: 40,
          product: 50,
          registration: 25,
          general: 60,
          fallback: 30
        }),
        description: 'Límites de palabras por tipo de respuesta'
      },
      {
        key: 'registration_url',
        value: 'https://www.escortshub.net/es/sign-up',
        description: 'URL oficial de registro actualizada'
      }
    ];

    for (const config of configs) {
      await pool.query(`
        INSERT INTO ai_configuration (config_key, config_value, description, updated_by, updated_at)
        VALUES ($1, $2, $3, 'system_setup', CURRENT_TIMESTAMP)
        ON CONFLICT (config_key) 
        DO UPDATE SET 
          config_value = EXCLUDED.config_value,
          description = EXCLUDED.description,
          updated_by = EXCLUDED.updated_by,
          updated_at = CURRENT_TIMESTAMP
      `, [config.key, config.value, config.description]);

      console.log(`✅ Configuration added: ${config.key}`);
    }

    // Mostrar configuraciones actuales
    console.log('\n📋 Current AI configuration:');
    const currentConfig = await pool.query(`
      SELECT config_key, LEFT(config_value, 100) as config_preview, description
      FROM ai_configuration
      ORDER BY config_key;
    `);
    
    console.table(currentConfig.rows);

  } catch (error) {
    console.error('❌ Setup failed:', error);
  } finally {
    await pool.end();
  }
}

setupAIConfig();
