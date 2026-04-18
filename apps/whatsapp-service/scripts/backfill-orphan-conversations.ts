/**
 * T1.1-bis paso 2: backfill de message_id en whatsapp_conversations huérfanas.
 *
 * Contexto: tras activar el writer unificado (commit 9c34802), cada nueva
 * fila en whatsapp_conversations queda vinculada a messages via message_id.
 * Pero los 58 huérfanos históricos quedaron con message_id NULL y con su
 * contenido real sólo en message_text (porque venían del flow previo al
 * refactor).
 *
 * Este script no puede hacer un matching contra messages existentes
 * (verificado: 0 matches por contenido — las 23 filas en messages eran del
 * seed). Hace un "copy-forward": crea filas nuevas en messages copiando
 * message_text / is_from_user / created_at / session_id de cada huérfano
 * y luego actualiza el message_id.
 *
 * Es idempotente: skipea cualquier fila que ya tenga message_id.
 *
 * Uso: pnpm --filter @leadcrm/whatsapp-service exec tsx scripts/backfill-orphan-conversations.ts
 */
import { PrismaClient, MessageDirection, MessageType } from '@leadcrm/db';

async function main() {
  const prisma = new PrismaClient();

  const beforeOrphans = await prisma.whatsAppConversation.count({
    where: { messageId: null },
  });
  console.log(`\n--- BEFORE: ${beforeOrphans} orphan rows ---`);

  const orphans = await prisma.whatsAppConversation.findMany({
    where: {
      messageId: null,
      messageText: { not: null },
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Processing ${orphans.length} orphans with non-null message_text...\n`);

  let migrated = 0;
  let skipped = 0;
  let leadCache = new Map<string, string | null>();

  for (const wc of orphans) {
    if (!wc.messageText) {
      skipped++;
      continue;
    }

    let leadId = leadCache.get(wc.phoneNumber);
    if (leadId === undefined) {
      const lead = await prisma.lead.findUnique({
        where: { phone: wc.phoneNumber.replace(/^\+/, '') },
        select: { id: true },
      });
      leadId = lead?.id ?? null;
      leadCache.set(wc.phoneNumber, leadId);
    }

    const direction = wc.isFromUser ? MessageDirection.INBOUND : MessageDirection.OUTBOUND;

    try {
      await prisma.$transaction(async tx => {
        const newMessage = await tx.message.create({
          data: {
            leadId,
            content: wc.messageText!,
            direction,
            messageType: MessageType.TEXT,
            sessionId: wc.sessionId,
            createdAt: wc.createdAt ?? undefined,
            updatedAt: wc.updatedAt ?? undefined,
          },
        });

        await tx.whatsAppConversation.update({
          where: { id: wc.id },
          data: {
            messageId: newMessage.id,
            leadId: wc.leadId ?? leadId,
          },
        });
      });

      migrated++;
    } catch (err: any) {
      console.error(`  ❌ Failed to migrate wc.id=${wc.id}:`, err.message);
      skipped++;
    }
  }

  const afterOrphans = await prisma.whatsAppConversation.count({
    where: { messageId: null },
  });
  const totalMessages = await prisma.message.count();
  const linkedWc = await prisma.whatsAppConversation.count({
    where: { messageId: { not: null } },
  });

  console.log(`\n--- AFTER ---`);
  console.log(`  migrated          : ${migrated}`);
  console.log(`  skipped           : ${skipped}`);
  console.log(`  orphans remaining : ${afterOrphans}`);
  console.log(`  wc linked total   : ${linkedWc}`);
  console.log(`  messages total    : ${totalMessages}`);

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
