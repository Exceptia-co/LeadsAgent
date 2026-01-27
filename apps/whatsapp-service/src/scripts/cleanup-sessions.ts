#!/usr/bin/env tsx

import { SessionCleanupUtil } from '../utils/sessionCleanup';
import { logger } from '../utils/logger';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    switch (command) {
      case 'status':
        await showSessionsStatus();
        break;

      case 'cleanup':
        const sessionId = args[1];
        if (!sessionId) {
          console.error('Error: Debe especificar un session ID');
          console.log('Uso: npm run cleanup-sessions cleanup <sessionId>');
          process.exit(1);
        }
        await cleanupSession(sessionId);
        break;

      case 'cleanup-all':
        await cleanupAllOrphanedSessions();
        break;

      case 'force-cleanup':
        const forceSessionId = args[1];
        if (!forceSessionId) {
          console.error('Error: Debe especificar un session ID');
          console.log('Uso: npm run cleanup-sessions force-cleanup <sessionId>');
          process.exit(1);
        }
        await forceCleanupSession(forceSessionId);
        break;

      default:
        showUsage();
        break;
    }
  } catch (error) {
    logger.error('Error en cleanup de sesiones:', error);
    process.exit(1);
  }
}

async function showSessionsStatus() {
  console.log('\n🔍 Estado de las sesiones de WhatsApp:\n');

  const sessions = await SessionCleanupUtil.getSessionsStatus('./sessions');

  if (sessions.length === 0) {
    console.log('✅ No se encontraron sesiones');
    return;
  }

  sessions.forEach(session => {
    const status = session.hasLockFiles ? '🔒 CON LOCKS' : '✅ LIMPIO';
    const size =
      session.sizeKB > 1024 ? `${(session.sizeKB / 1024).toFixed(1)} MB` : `${session.sizeKB} KB`;

    console.log(`📱 ${session.sessionId}:`);
    console.log(`   Estado: ${status} (${session.lockFilesCount} locks)`);
    console.log(`   Tamaño: ${size}`);
    console.log(`   Modificado: ${session.lastModified.toLocaleString()}`);
    console.log('');
  });

  const totalWithLocks = sessions.filter(s => s.hasLockFiles).length;
  if (totalWithLocks > 0) {
    console.log(`⚠️  ${totalWithLocks} sesiones tienen archivos bloqueados`);
    console.log('   Ejecuta: npm run cleanup-sessions cleanup-all');
  }
}

async function cleanupSession(sessionId: string) {
  console.log(`\n🧹 Limpiando sesión: ${sessionId}`);

  try {
    await SessionCleanupUtil.cleanupSession(sessionId, './sessions');
    console.log(`✅ Sesión ${sessionId} limpiada exitosamente`);
  } catch (error) {
    console.error(`❌ Error limpiando sesión ${sessionId}:`, error);
    throw error;
  }
}

async function cleanupAllOrphanedSessions() {
  console.log('\n🧹 Limpiando todas las sesiones huérfanas...');

  try {
    await SessionCleanupUtil.cleanupOrphanedSessions('./sessions');
    console.log('✅ Limpieza de sesiones huérfanas completada');
  } catch (error) {
    console.error('❌ Error durante la limpieza general:', error);
    throw error;
  }
}

async function forceCleanupSession(sessionId: string) {
  console.log(`\n💥 Forzando limpieza de sesión: ${sessionId}`);
  console.log('⚠️  Esto eliminará todos los archivos sin verificaciones');

  try {
    // Detener cualquier proceso Node.js que pueda estar usando la sesión
    const { execSync } = await import('child_process');

    // En Windows, usar taskkill para cerrar procesos Node.js
    if (process.platform === 'win32') {
      try {
        execSync('taskkill /F /IM node.exe', { stdio: 'pipe' });
        console.log('🔧 Procesos Node.js terminados');
      } catch (error) {
        // Ignorar si no hay procesos para terminar
      }
    }

    // Esperar un momento para que se liberen los archivos
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Forzar limpieza
    await SessionCleanupUtil.cleanupSession(sessionId, './sessions');
    console.log(`✅ Sesión ${sessionId} limpiada forzadamente`);
  } catch (error) {
    console.error(`❌ Error en limpieza forzada de sesión ${sessionId}:`, error);
    throw error;
  }
}

function showUsage() {
  console.log(`
🔧 Utilidad de limpieza de sesiones de WhatsApp

Uso:
  npm run cleanup-sessions <comando> [argumentos]

Comandos:
  status                    - Muestra el estado de todas las sesiones
  cleanup <sessionId>       - Limpia una sesión específica
  cleanup-all              - Limpia todas las sesiones huérfanas
  force-cleanup <sessionId> - Fuerza la limpieza de una sesión

Ejemplos:
  npm run cleanup-sessions status
  npm run cleanup-sessions cleanup test
  npm run cleanup-sessions cleanup-all
  npm run cleanup-sessions force-cleanup test
`);
}

// Ejecutar solo si este archivo es ejecutado directamente
if (require.main === module) {
  main().catch(error => {
    console.error('Error fatal:', error);
    process.exit(1);
  });
}

export { main as cleanupSessionsCLI };
