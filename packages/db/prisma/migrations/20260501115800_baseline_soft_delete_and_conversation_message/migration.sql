-- Baseline schema drift that existed before B1.
-- Keep idempotent: production may already have these columns from manual/runtime migrations.
ALTER TABLE "public"."leads"
    ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ(6);

ALTER TABLE "public"."messages"
    ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ(6);

ALTER TABLE "public"."whatsapp_conversations"
    ADD COLUMN IF NOT EXISTS "message_id" UUID;

CREATE INDEX IF NOT EXISTS "idx_leads_deleted_at" ON "public"."leads"("deleted_at");
CREATE INDEX IF NOT EXISTS "idx_messages_deleted_at" ON "public"."messages"("deleted_at");
CREATE INDEX IF NOT EXISTS "idx_whatsapp_conversations_message_id" ON "public"."whatsapp_conversations"("message_id");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'whatsapp_conversations_message_id_fkey'
    ) THEN
        ALTER TABLE "public"."whatsapp_conversations"
            ADD CONSTRAINT "whatsapp_conversations_message_id_fkey"
            FOREIGN KEY ("message_id")
            REFERENCES "public"."messages"("id")
            ON DELETE SET NULL
            ON UPDATE NO ACTION;
    END IF;
END $$;
