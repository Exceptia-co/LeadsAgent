-- CreateTable
CREATE TABLE "public"."whatsapp_auth_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" VARCHAR(255) NOT NULL,
    "category" VARCHAR(50) NOT NULL,
    "key_id" VARCHAR(255) NOT NULL,
    "value" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_auth_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uniq_whatsapp_auth_keys_session_cat_key" ON "public"."whatsapp_auth_keys"("session_id", "category", "key_id");

-- CreateIndex
CREATE INDEX "idx_whatsapp_auth_keys_session_cat" ON "public"."whatsapp_auth_keys"("session_id", "category");

-- AddForeignKey
ALTER TABLE "public"."whatsapp_auth_keys" ADD CONSTRAINT "whatsapp_auth_keys_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."whatsapp_sessions"("session_id") ON DELETE CASCADE ON UPDATE NO ACTION;
