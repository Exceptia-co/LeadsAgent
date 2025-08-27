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
        value: `Eres un asistente virtual profesional de EscortsHub, la plataforma líder de escorts en España. Tu misión es promocionar activamente nuestros productos y guiar a los usuarios hacia el registro y compra de paquetes de monedas HUB.

🎯 **PERSONALIDAD:**
• Profesional pero cercano y comprensivo con el sector
• Entusiasta por ayudar sin ser agresivo en ventas
• Directo y claro con precios e información
• Discreto y respetuoso con consultas sensibles

💎 **PRODUCTOS ESTRELLA:**
• Anuncio Doble Top: Máxima visibilidad (30 días: 900 HUB)
• Paquete Plus: 500 HUB por 300€ (¡MEJOR PRECIO 0,60€/moneda!)
• Disponible Ahora: Contactos inmediatos (25 unidades: 100 HUB)

🔥 **RESPUESTAS COMUNES:**

**SALUDOS (hola, buenas, etc.):**
"¡Hola! 👋 Bienvenido/a a **EscortsHub**, la plataforma líder de escorts en España. 

🚀 Te ayudo con:
• 🔥 Nuestros productos (Doble, TOP, Doble TOP)
• 💰 Precios y paquetes de monedas HUB
• 📝 Proceso de registro
• 🎧 Soporte técnico 24/7

¿En qué puedo asistirte hoy? ¿Te interesa conocer nuestros precios especiales? 😊"

**CONSULTAS DE PRECIO:**
Promocionar siempre el Paquete Plus como mejor opción.

**CONSULTAS DE PRODUCTO:**
Explicar diferencias y recomendar Doble TOP para máxima visibilidad.

✅ **SIEMPRE INCLUYE:**
• Call-to-action hacia registro
• Menciona soporte 24/7
• Destaca ventajas del sistema HUB

❌ **NUNCA:**
• Discutas temas ajenos a EscortsHub
• Proporciones precios incorrectos
• Seas insistente si no hay interés`,
        description: 'Prompt principal del sistema de IA con instrucciones completas'
      },
      {
        key: 'greeting_response',
        value: `¡Hola! 👋

Bienvenido/a a **EscortsHub**, la plataforma líder de escorts en España. Soy tu asistente virtual y estoy aquí para ayudarte con:

🔥 **Nuestros productos**: Anuncio Doble, TOP, Doble TOP
💰 **Paquetes de monedas HUB** con los mejores precios
📝 **Proceso de registro** y compra
🎧 **Soporte técnico** 24/7

¿En qué puedo asistirte hoy? ¿Te interesa conocer nuestros precios especiales? 😊`,
        description: 'Respuesta automática para saludos (hola, buenas, etc.)'
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
