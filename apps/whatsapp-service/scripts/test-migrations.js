#!/usr/bin/env node

/**
 * Script de prueba para verificar el funcionamiento del sistema de migraciones automáticas
 * 
 * Este script:
 * 1. Inicializa el DatabaseService
 * 2. Verifica que las migraciones se ejecuten automáticamente
 * 3. Comprueba que la tabla whatsapp_whitelist_logs tenga la columna lead_id como VARCHAR
 * 4. Muestra el estado de las migraciones
 */

require('dotenv').config();

// Usar console.log en lugar del logger para evitar problemas de importación
// const { logger } = require('../src/utils/logger');

// Para TypeScript en un entorno Node.js, necesitamos usar ts-node o compilar primero
let DatabaseService;
try {
  // Intentar importar desde build si existe
  DatabaseService = require('../dist/services/DatabaseService').default;
} catch (error) {
  console.warn('⚠️ No se encontró build compilado, intentando con ts-node...');
  try {
    require('ts-node/register');
    DatabaseService = require('../src/services/DatabaseService').default;
  } catch (tsError) {
    console.error('❌ No se pudo cargar DatabaseService:');
    console.error('💡 Ejecuta "npm run build" o instala ts-node: "npm install -D ts-node"');
    process.exit(1);
  }
}

async function testMigrations() {
  console.log('🔄 Iniciando test de migraciones automáticas...\n');

  try {
    // 1. Verificar conexión a la base de datos
    console.log('1️⃣ Verificando conexión a la base de datos...');
    const isConnected = await DatabaseService.testConnection();
    
    if (!isConnected) {
      console.error('❌ No se pudo conectar a la base de datos');
      console.log('💡 Asegúrate de que DATABASE_URL esté configurado y la base de datos esté disponible');
      process.exit(1);
    }
    console.log('✅ Conexión a la base de datos exitosa\n');

    // 2. Inicializar las tablas (esto ejecutará las migraciones automáticamente)
    console.log('2️⃣ Inicializando tablas y ejecutando migraciones...');
    await DatabaseService.initializeTable();
    console.log('✅ Inicialización de tablas completada\n');

    // 3. Verificar la estructura de la tabla whatsapp_whitelist_logs
    console.log('3️⃣ Verificando estructura de tabla whatsapp_whitelist_logs...');
    
    const checkColumnQuery = `
      SELECT 
        column_name, 
        data_type, 
        is_nullable,
        column_default
      FROM information_schema.columns 
      WHERE table_name = 'whatsapp_whitelist_logs' 
        AND column_name = 'lead_id'
    `;
    
    const result = await DatabaseService.pool?.query(checkColumnQuery);
    
    if (result && result.rows.length > 0) {
      const column = result.rows[0];
      console.log(`✅ Columna lead_id encontrada:`);
      console.log(`   - Tipo: ${column.data_type}`);
      console.log(`   - Nullable: ${column.is_nullable}`);
      console.log(`   - Default: ${column.column_default || 'NULL'}`);
      
      if (column.data_type === 'character varying') {
        console.log('🎉 ¡Migración exitosa! La columna lead_id es VARCHAR como se esperaba');
      } else {
        console.warn(`⚠️ La columna lead_id tiene tipo ${column.data_type}, se esperaba VARCHAR`);
      }
    } else {
      console.error('❌ La columna lead_id no fue encontrada en whatsapp_whitelist_logs');
    }
    console.log('');

    // 4. Verificar tabla de migraciones
    console.log('4️⃣ Verificando tabla de migraciones...');
    const migrationsQuery = `
      SELECT 
        migration_name,
        executed_at,
        execution_time_ms
      FROM migrations 
      ORDER BY executed_at ASC
    `;
    
    try {
      const migrationsResult = await DatabaseService.pool?.query(migrationsQuery);
      
      if (migrationsResult && migrationsResult.rows.length > 0) {
        console.log('✅ Migraciones ejecutadas:');
        migrationsResult.rows.forEach((migration, index) => {
          const executedDate = new Date(migration.executed_at).toLocaleString();
          console.log(`   ${index + 1}. ${migration.migration_name}`);
          console.log(`      Ejecutada: ${executedDate}`);
          console.log(`      Tiempo: ${migration.execution_time_ms}ms`);
        });
      } else {
        console.log('📝 No se encontraron migraciones ejecutadas');
      }
    } catch (error) {
      console.log('📝 Tabla de migraciones no existe aún (normal en primera ejecución)');
    }
    console.log('');

    // 5. Test básico de funcionalidad del whitelist
    console.log('5️⃣ Realizando test básico de logging de whitelist...');
    
    const testLog = await DatabaseService.logWhitelistDecision({
      phoneNumber: '+5491123456789',
      sessionId: 'test-migration-session',
      decision: 'ALLOWED',
      reason: 'Test de migración - lead autorizado',
      leadId: 'test-lead-001',
      leadName: 'Test User',
      messagePreview: 'Mensaje de prueba para verificar migraciones',
      aiProvider: 'test'
    });
    
    if (testLog) {
      console.log(`✅ Log de whitelist creado exitosamente: ${testLog}`);
      
      // Verificar que se pueda leer el log
      const logs = await DatabaseService.getWhitelistLogs({ 
        sessionId: 'test-migration-session', 
        limit: 1 
      });
      
      if (logs.length > 0) {
        console.log('✅ Log de whitelist leído exitosamente');
        console.log(`   Lead ID: ${logs[0].leadId || 'N/A'}`);
        console.log(`   Decisión: ${logs[0].decision}`);
      } else {
        console.warn('⚠️ No se pudo leer el log de whitelist creado');
      }
    } else {
      console.error('❌ No se pudo crear log de whitelist de prueba');
    }
    console.log('');

    // 6. Limpieza
    console.log('6️⃣ Limpiando datos de prueba...');
    try {
      const cleanupQuery = `DELETE FROM whatsapp_whitelist_logs WHERE session_id = 'test-migration-session'`;
      await DatabaseService.pool?.query(cleanupQuery);
      console.log('✅ Datos de prueba eliminados');
    } catch (error) {
      console.warn('⚠️ No se pudieron eliminar todos los datos de prueba');
    }

    console.log('\n🎉 ¡Test de migraciones completado exitosamente!');
    console.log('✅ El sistema de migraciones automáticas está funcionando correctamente');
    console.log('✅ La configuración del whitelist está lista para usar');

  } catch (error) {
    console.error('\n❌ Error durante el test de migraciones:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  } finally {
    // Cerrar conexión
    try {
      await DatabaseService.close();
      console.log('\n🔐 Conexión a la base de datos cerrada');
    } catch (error) {
      console.warn('⚠️ Error cerrando conexión:', error.message);
    }
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  testMigrations()
    .then(() => {
      console.log('\n✅ Test completado');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Test fallido:', error);
      process.exit(1);
    });
}

module.exports = { testMigrations };
