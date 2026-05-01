-- CreateEnum
CREATE TYPE "public"."primary_goal" AS ENUM ('register', 'purchase', 'meeting', 'contact', 'custom');

-- CreateEnum
CREATE TYPE "public"."agent_tone" AS ENUM ('formal', 'casual', 'friendly', 'technical');

-- AlterTable
ALTER TABLE "public"."leads" ADD COLUMN     "tenant_id" UUID;

-- AlterTable
ALTER TABLE "public"."messages" ADD COLUMN     "tenant_id" UUID;

-- AlterTable
ALTER TABLE "public"."ai_configuration" ADD COLUMN     "tenant_id" UUID;

-- AlterTable
ALTER TABLE "public"."ai_knowledge_base" ADD COLUMN     "agent_id" UUID,
ADD COLUMN     "tenant_id" UUID;

-- AlterTable
ALTER TABLE "public"."message_templates" ADD COLUMN     "tenant_id" UUID;

-- AlterTable
ALTER TABLE "public"."proactive_messages" ADD COLUMN     "tenant_id" UUID;

-- AlterTable
ALTER TABLE "public"."whatsapp_conversations" ADD COLUMN     "tenant_id" UUID,
ADD COLUMN     "whatsapp_session_id" UUID;

-- AlterTable
ALTER TABLE "public"."ai_training_interactions" ADD COLUMN     "tenant_id" UUID;

-- AlterTable
ALTER TABLE "public"."whatsapp_sessions" ADD COLUMN     "ai_agent_id" UUID,
ADD COLUMN     "tenant_id" UUID;

-- AlterTable
ALTER TABLE "public"."whatsapp_whitelist_logs" ADD COLUMN     "tenant_id" UUID;

-- CreateTable
CREATE TABLE "public"."tenants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clerk_org_id" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "plan" VARCHAR(50) NOT NULL DEFAULT 'starter',
    "settings" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ai_agents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "business_name" VARCHAR(255) NOT NULL,
    "industry" VARCHAR(255),
    "website_url" VARCHAR(500),
    "logo_url" VARCHAR(500),
    "business_hours" JSONB,
    "persona_name" VARCHAR(255),
    "primary_goal" "public"."primary_goal" NOT NULL DEFAULT 'contact',
    "goal_cta_url" VARCHAR(500),
    "goal_description" TEXT,
    "tone" "public"."agent_tone" NOT NULL DEFAULT 'friendly',
    "language" VARCHAR(10) NOT NULL DEFAULT 'es',
    "custom_instructions" TEXT,
    "response_max_words" INTEGER,
    "allow_emojis" BOOLEAN NOT NULL DEFAULT true,
    "llm_provider" VARCHAR(50),
    "llm_model" VARCHAR(100),
    "enable_structured_extraction" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ai_products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "price_min" DECIMAL(10,2),
    "price_max" DECIMAL(10,2),
    "url" VARCHAR(500),
    "image_url" VARCHAR(500),
    "tags" VARCHAR(50)[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_clerk_org_id_key" ON "public"."tenants"("clerk_org_id");

-- CreateIndex
CREATE INDEX "idx_ai_agents_tenant_id" ON "public"."ai_agents"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_ai_products_tenant_id" ON "public"."ai_products"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_ai_products_agent_id" ON "public"."ai_products"("agent_id");

-- CreateIndex
CREATE INDEX "idx_leads_tenant_id" ON "public"."leads"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_messages_tenant_id" ON "public"."messages"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_ai_config_tenant_id" ON "public"."ai_configuration"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_knowledge_tenant_id" ON "public"."ai_knowledge_base"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_knowledge_agent_id" ON "public"."ai_knowledge_base"("agent_id");

-- CreateIndex
CREATE INDEX "idx_templates_tenant_id" ON "public"."message_templates"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_proactive_tenant_id" ON "public"."proactive_messages"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_whatsapp_conversations_tenant_id" ON "public"."whatsapp_conversations"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_whatsapp_conversations_session_uuid" ON "public"."whatsapp_conversations"("whatsapp_session_id");

-- CreateIndex
CREATE INDEX "idx_ai_training_tenant_id" ON "public"."ai_training_interactions"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_sessions_tenant_id" ON "public"."whatsapp_sessions"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_sessions_ai_agent_id" ON "public"."whatsapp_sessions"("ai_agent_id");

-- CreateIndex
CREATE INDEX "idx_whitelist_logs_tenant_id" ON "public"."whatsapp_whitelist_logs"("tenant_id");

-- AddForeignKey
ALTER TABLE "public"."leads" ADD CONSTRAINT "leads_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."ai_configuration" ADD CONSTRAINT "ai_configuration_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."ai_knowledge_base" ADD CONSTRAINT "ai_knowledge_base_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."ai_knowledge_base" ADD CONSTRAINT "ai_knowledge_base_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."ai_agents"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."message_templates" ADD CONSTRAINT "message_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."proactive_messages" ADD CONSTRAINT "proactive_messages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_whatsapp_session_id_fkey" FOREIGN KEY ("whatsapp_session_id") REFERENCES "public"."whatsapp_sessions"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."ai_training_interactions" ADD CONSTRAINT "ai_training_interactions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."whatsapp_sessions" ADD CONSTRAINT "whatsapp_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."whatsapp_sessions" ADD CONSTRAINT "whatsapp_sessions_ai_agent_id_fkey" FOREIGN KEY ("ai_agent_id") REFERENCES "public"."ai_agents"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."whatsapp_whitelist_logs" ADD CONSTRAINT "whatsapp_whitelist_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."ai_agents" ADD CONSTRAINT "ai_agents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."ai_products" ADD CONSTRAINT "ai_products_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."ai_products" ADD CONSTRAINT "ai_products_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."ai_agents"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
