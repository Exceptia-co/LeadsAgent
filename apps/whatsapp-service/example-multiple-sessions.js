#!/usr/bin/env node

/**
 * 🔍 Ejemplo: Múltiples Sesiones de WhatsApp
 * 
 * Este script demuestra cómo crear y gestionar múltiples sesiones
 * de WhatsApp simultáneamente.
 */

const express = require('express');

// Simulación de la API para demostrar múltiples sesiones
class MultipleSessionsDemo {
  constructor() {
    this.app = express();
    this.app.use(express.json());
    this.setupRoutes();
  }

  setupRoutes() {
    // Endpoint para crear sesión
    this.app.post('/sessions/:sessionId', async (req, res) => {
      const { sessionId } = req.params;
      
      console.log(`\n🔄 Creando sesión: ${sessionId}`);
      
      try {
        // En tu implementación real, sería:
        // const session = await whatsappService.createSession(sessionId);
        
        // Simulación
        const session = {
          id: sessionId,
          status: 'connecting',
          qrCode: `mock_qr_${sessionId}`,
          created: new Date()
        };

        console.log(`✅ Sesión ${sessionId} creada exitosamente`);
        console.log(`📱 Escanea el QR code para conectar`);
        
        res.json({
          success: true,
          session: session,
          instructions: [
            '1. Escanea el QR code con WhatsApp',
            '2. Espera a que el estado cambie a "ready"', 
            '3. Puedes crear más sesiones con diferentes IDs'
          ]
        });
      } catch (error) {
        console.error(`❌ Error creando sesión ${sessionId}:`, error.message);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Endpoint para listar todas las sesiones
    this.app.get('/sessions', async (req, res) => {
      console.log('\n📋 Obteniendo todas las sesiones...');
      
      try {
        // En tu implementación real, sería:
        // const sessions = await whatsappService.getAllSessions();
        
        // Simulación de sesiones activas
        const sessions = [
          { id: 'empresa-ventas', status: 'ready', connectedNumber: '+1234567890' },
          { id: 'empresa-soporte', status: 'connecting', connectedNumber: null },
          { id: 'empresa-marketing', status: 'ready', connectedNumber: '+5556667777' }
        ];

        console.log(`📊 Total de sesiones: ${sessions.length}`);
        sessions.forEach(session => {
          const status = session.status === 'ready' ? '✅' : '🔄';
          const number = session.connectedNumber || 'No conectado';
          console.log(`   ${status} ${session.id}: ${session.status} (${number})`);
        });

        res.json({
          success: true,
          totalSessions: sessions.length,
          sessions: sessions
        });
      } catch (error) {
        console.error('❌ Error obteniendo sesiones:', error.message);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Endpoint para enviar mensaje desde sesión específica
    this.app.post('/sessions/:sessionId/message', async (req, res) => {
      const { sessionId } = req.params;
      const { to, message } = req.body;
      
      console.log(`\n📤 Enviando mensaje desde sesión ${sessionId}`);
      console.log(`   Para: ${to}`);
      console.log(`   Mensaje: ${message.substring(0, 50)}...`);
      
      try {
        // En tu implementación real, sería:
        // const result = await whatsappService.sendMessage(sessionId, to, message);
        
        // Simulación
        const result = {
          success: true,
          messageId: `msg_${Date.now()}`,
          sessionId: sessionId,
          timestamp: new Date()
        };

        console.log(`✅ Mensaje enviado exitosamente desde ${sessionId}`);
        console.log(`   ID del mensaje: ${result.messageId}`);
        
        res.json(result);
      } catch (error) {
        console.error(`❌ Error enviando mensaje desde ${sessionId}:`, error.message);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Endpoint para cerrar sesión específica
    this.app.delete('/sessions/:sessionId', async (req, res) => {
      const { sessionId } = req.params;
      
      console.log(`\n🗑️ Cerrando sesión: ${sessionId}`);
      
      try {
        // En tu implementación real, sería:
        // await whatsappService.destroySession(sessionId);
        
        console.log(`✅ Sesión ${sessionId} cerrada exitosamente`);
        console.log(`🧹 Archivos de sesión limpiados`);
        
        res.json({
          success: true,
          message: `Sesión ${sessionId} cerrada correctamente`
        });
      } catch (error) {
        console.error(`❌ Error cerrando sesión ${sessionId}:`, error.message);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Endpoint de salud para monitorear recursos
    this.app.get('/health', (req, res) => {
      const memUsage = process.memoryUsage();
      const uptime = process.uptime();
      
      console.log('\n💊 Estado de salud del servicio:');
      console.log(`   Tiempo activo: ${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`);
      console.log(`   RAM usada: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
      console.log(`   RAM total: ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`);
      
      res.json({
        status: 'healthy',
        uptime: `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`,
        memory: {
          used: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
          total: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`
        }
      });
    });
  }

  start(port = 3001) {
    this.app.listen(port, () => {
      console.log('\n🚀 Demo de Múltiples Sesiones WhatsApp');
      console.log(`📡 Servidor corriendo en: http://localhost:${port}`);
      console.log('\n📋 Endpoints disponibles:');
      console.log(`   POST   /sessions/:sessionId          - Crear sesión`);
      console.log(`   GET    /sessions                     - Listar sesiones`);
      console.log(`   POST   /sessions/:sessionId/message  - Enviar mensaje`);
      console.log(`   DELETE /sessions/:sessionId          - Cerrar sesión`);
      console.log(`   GET    /health                       - Estado del servicio`);
      
      console.log('\n🧪 Ejemplos de uso:');
      console.log(`   curl -X POST http://localhost:${port}/sessions/empresa-ventas`);
      console.log(`   curl -X POST http://localhost:${port}/sessions/empresa-soporte`);
      console.log(`   curl http://localhost:${port}/sessions`);
      console.log(`   curl http://localhost:${port}/health`);
      
      console.log('\n📚 Casos de uso recomendados:');
      console.log('   ✅ empresa-ventas     → Para equipo de ventas');
      console.log('   ✅ empresa-soporte    → Para equipo de soporte');
      console.log('   ✅ empresa-marketing  → Para equipo de marketing');
      console.log('   ✅ cliente-abc        → Para cliente específico');
      console.log('   ✅ test-desarrollo    → Para pruebas');
      
      console.log('\n⚠️  Recordatorios importantes:');
      console.log('   • Cada sesión necesita un número de WhatsApp diferente');
      console.log('   • Máximo recomendado: 10-15 sesiones simultáneas');
      console.log('   • Usa nombres descriptivos para las sesiones');
      console.log('   • Monitorea el uso de recursos regularmente');
    });
  }
}

// Funciones de utilidad para testing
function showExampleScenarios() {
  console.log('\n🎯 Escenarios de Ejemplo para Múltiples Sesiones:');
  
  console.log('\n📱 Escenario 1: Empresa con Departamentos');
  console.log('   session-ventas      → WhatsApp: +123-456-7890');
  console.log('   session-soporte     → WhatsApp: +123-456-7891'); 
  console.log('   session-marketing   → WhatsApp: +123-456-7892');
  console.log('   session-recursos    → WhatsApp: +123-456-7893');
  
  console.log('\n🏢 Escenario 2: Múltiples Clientes');
  console.log('   cliente-abc         → WhatsApp del cliente ABC');
  console.log('   cliente-xyz         → WhatsApp del cliente XYZ');
  console.log('   cliente-123         → WhatsApp del cliente 123');
  
  console.log('\n🧪 Escenario 3: Entornos de Desarrollo');
  console.log('   test-dev            → Para desarrollo');
  console.log('   test-staging        → Para staging');
  console.log('   prod-main           → Para producción');
  
  console.log('\n⚠️  Lo que NO debes hacer:');
  console.log('   ❌ session-1, session-2  → Nombres no descriptivos');
  console.log('   ❌ Mismo número en múltiples sesiones');
  console.log('   ❌ Más de 30 sesiones simultáneas');
  console.log('   ❌ Sesiones sin propósito claro');
}

// Iniciar demo si se ejecuta directamente
if (require.main === module) {
  showExampleScenarios();
  
  const demo = new MultipleSessionsDemo();
  demo.start(3001);
  
  // Mostrar información adicional después de unos segundos
  setTimeout(() => {
    console.log('\n💡 Tip: Abre otra terminal y prueba los comandos curl mostrados arriba');
    console.log('💡 Tip: Usa Postman o tu herramienta preferida para probar la API');
    console.log('💡 Tip: Cada sesión es independiente y puede tener diferentes estados');
  }, 3000);
}

module.exports = MultipleSessionsDemo;
