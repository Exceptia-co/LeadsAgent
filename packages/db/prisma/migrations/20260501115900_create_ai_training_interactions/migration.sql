-- Baseline missing historical runtime table so clean local databases can migrate.
-- Production already has this table from whatsapp-service startup SQL, so keep this idempotent.
CREATE TABLE IF NOT EXISTS "public"."ai_training_interactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_message" TEXT NOT NULL,
    "ai_response" TEXT NOT NULL,
    "knowledge_base_ids_used" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "success_score" DECIMAL(3,2) DEFAULT 0.50,
    "context_data" JSONB NOT NULL,
    "feedback_metrics" JSONB NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_training_interactions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ai_training_interactions_success_score_check" CHECK ("success_score" >= 0 AND "success_score" <= 1)
);

CREATE INDEX IF NOT EXISTS "idx_training_score" ON "public"."ai_training_interactions"("success_score");
CREATE INDEX IF NOT EXISTS "idx_training_created" ON "public"."ai_training_interactions"("created_at");
CREATE INDEX IF NOT EXISTS "idx_training_context_phone" ON "public"."ai_training_interactions"((context_data->>'phoneNumber'));
CREATE INDEX IF NOT EXISTS "idx_training_user_message" ON "public"."ai_training_interactions" USING gin(to_tsvector('spanish', user_message));
CREATE INDEX IF NOT EXISTS "idx_training_kb_used" ON "public"."ai_training_interactions" USING gin("knowledge_base_ids_used");
