#!/usr/bin/env tsx

/**
 * Export SQLite Data to JSON
 * 
 * Este script exporta todos los datos de la base de datos SQLite
 * a archivos JSON para facilitar la migración a PostgreSQL.
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'file:./prisma/dev.db'
    }
  }
});

const BACKUP_DIR = path.join(__dirname, '..', 'data-backup');

async function exportData() {
  console.log('🔄 Iniciando exportación de datos SQLite...');
  
  try {
    // Asegurar que el directorio de backup existe
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    // Exportar usuarios
    console.log('📤 Exportando usuarios...');
    const users = await prisma.user.findMany({
      include: {
        leads: true
      }
    });
    fs.writeFileSync(
      path.join(BACKUP_DIR, 'users.json'),
      JSON.stringify(users, null, 2)
    );
    console.log(`✅ ${users.length} usuarios exportados`);

    // Exportar leads
    console.log('📤 Exportando leads...');
    const leads = await prisma.lead.findMany({
      include: {
        user: true,
        conversation: {
          include: {
            messages: true
          }
        }
      }
    });
    fs.writeFileSync(
      path.join(BACKUP_DIR, 'leads.json'),
      JSON.stringify(leads, null, 2)
    );
    console.log(`✅ ${leads.length} leads exportados`);

    // Exportar conversaciones
    console.log('📤 Exportando conversaciones...');
    const conversations = await prisma.conversation.findMany({
      include: {
        lead: true,
        messages: true
      }
    });
    fs.writeFileSync(
      path.join(BACKUP_DIR, 'conversations.json'),
      JSON.stringify(conversations, null, 2)
    );
    console.log(`✅ ${conversations.length} conversaciones exportadas`);

    // Exportar mensajes
    console.log('📤 Exportando mensajes...');
    const messages = await prisma.message.findMany({
      include: {
        conversation: {
          include: {
            lead: true
          }
        }
      },
      orderBy: {
        createdAt: 'asc'
      }
    });
    fs.writeFileSync(
      path.join(BACKUP_DIR, 'messages.json'),
      JSON.stringify(messages, null, 2)
    );
    console.log(`✅ ${messages.length} mensajes exportados`);

    // Crear resumen de exportación
    const exportSummary = {
      exportDate: new Date().toISOString(),
      totalRecords: {
        users: users.length,
        leads: leads.length,
        conversations: conversations.length,
        messages: messages.length
      },
      files: [
        'users.json',
        'conversations.json', 
        'leads.json',
        'messages.json'
      ],
      database: {
        source: 'SQLite (dev.db)',
        backupFile: 'dev.db.backup'
      }
    };

    fs.writeFileSync(
      path.join(BACKUP_DIR, 'export-summary.json'),
      JSON.stringify(exportSummary, null, 2)
    );

    console.log('🎉 Exportación completada exitosamente!');
    console.log(`📁 Archivos guardados en: ${BACKUP_DIR}`);
    console.log('📊 Resumen:', JSON.stringify(exportSummary.totalRecords, null, 2));

  } catch (error) {
    console.error('❌ Error durante la exportación:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar exportación si el script se ejecuta directamente
if (require.main === module) {
  exportData()
    .catch(console.error);
}

export { exportData };
