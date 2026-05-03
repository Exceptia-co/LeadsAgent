-- CreateEnum
CREATE TYPE "public"."lead_status" AS ENUM ('new', 'contacted', 'qualified', 'won', 'lost');

-- CreateEnum
CREATE TYPE "public"."message_type" AS ENUM ('text', 'image', 'audio', 'video', 'document');

-- CreateEnum
CREATE TYPE "public"."message_direction" AS ENUM ('incoming', 'outgoing');

-- CreateEnum
CREATE TYPE "public"."message_status" AS ENUM ('pending', 'sent', 'delivered', 'read', 'failed');

-- CreateTable
CREATE TABLE "public"."users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clerk_id" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "first_name" VARCHAR(255),
    "last_name" VARCHAR(255),
    "profile_image_url" VARCHAR(500),
    "role" VARCHAR(50) DEFAULT 'user',
    "is_active" BOOLEAN DEFAULT true,
    "last_login_at" TIMESTAMPTZ(6),
    "settings" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."leads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255),
    "email" VARCHAR(255),
    "phone" VARCHAR(50) NOT NULL,
    "status" "public"."lead_status" DEFAULT 'new',
    "source" VARCHAR(255),
    "tags" JSONB DEFAULT '[]',
    "whatsapp_authorized" BOOLEAN DEFAULT true,
    "mood_score" DECIMAL(3,2),
    "last_contact" TIMESTAMPTZ(6),
    "assigned_to" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "lead_id" UUID,
    "content" TEXT NOT NULL,
    "direction" "public"."message_direction" NOT NULL,
    "message_type" "public"."message_type" DEFAULT 'text',
    "status" "public"."message_status" DEFAULT 'pending',
    "session_id" VARCHAR(255),
    "whatsapp_message_id" VARCHAR(255),
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ai_configuration" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "config_key" VARCHAR(100) NOT NULL,
    "config_value" TEXT NOT NULL,
    "description" TEXT,
    "updated_by" VARCHAR(255),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_configuration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ai_knowledge_base" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "category" VARCHAR(100) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "content" TEXT NOT NULL,
    "keywords" TEXT[],
    "priority" INTEGER DEFAULT 1,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_knowledge_base_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."message_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "subject" VARCHAR(500),
    "content" TEXT NOT NULL,
    "variables" JSONB DEFAULT '[]',
    "is_active" BOOLEAN DEFAULT true,
    "usage_count" INTEGER DEFAULT 0,
    "created_by" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."proactive_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "lead_id" UUID,
    "template_id" UUID,
    "template_name" VARCHAR(255),
    "phone_number" VARCHAR(50) NOT NULL,
    "content" TEXT NOT NULL,
    "status" VARCHAR(50) DEFAULT 'pending',
    "variables" JSONB,
    "session_id" VARCHAR(255),
    "sent_at" TIMESTAMPTZ(6),
    "delivered_at" TIMESTAMPTZ(6),
    "error_message" TEXT,
    "created_by" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proactive_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."whatsapp_conversations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "lead_id" UUID,
    "session_id" VARCHAR(255) NOT NULL,
    "phone_number" VARCHAR(50) NOT NULL,
    "contact_name" VARCHAR(255),
    "message_text" TEXT,
    "response_text" TEXT,
    "message_type" VARCHAR(50) DEFAULT 'text',
    "intent" VARCHAR(255),
    "sentiment" VARCHAR(100),
    "is_from_user" BOOLEAN DEFAULT true,
    "tokens_used" INTEGER DEFAULT 0,
    "last_message_at" TIMESTAMPTZ(6),
    "message_count" INTEGER DEFAULT 0,
    "status" VARCHAR(50) DEFAULT 'active',
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "ai_provider" VARCHAR(50) DEFAULT 'gemini',

    CONSTRAINT "whatsapp_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."whatsapp_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255),
    "status" VARCHAR(50) NOT NULL DEFAULT 'connecting',
    "qr_code" TEXT,
    "connected_number" VARCHAR(50),
    "auth_data" JSONB,
    "last_seen" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "reconnect_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "webhook_url" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."whatsapp_whitelist_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "phone_number" VARCHAR(50) NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "reason" TEXT,
    "created_by" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "decision" VARCHAR(50),
    "session_id" VARCHAR(255),

    CONSTRAINT "whatsapp_whitelist_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."system_variables" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" VARCHAR(100) NOT NULL,
    "value" VARCHAR(1000) NOT NULL,
    "description" VARCHAR(500),
    "category" VARCHAR(100) NOT NULL DEFAULT 'system',
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_variables_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_clerk_id_key" ON "public"."users"("clerk_id");

-- CreateIndex
CREATE INDEX "idx_users_clerk_id" ON "public"."users"("clerk_id");

-- CreateIndex
CREATE INDEX "idx_users_created_at" ON "public"."users"("created_at");

-- CreateIndex
CREATE INDEX "idx_users_email" ON "public"."users"("email");

-- CreateIndex
CREATE INDEX "idx_users_is_active" ON "public"."users"("is_active");

-- CreateIndex
CREATE INDEX "idx_users_role" ON "public"."users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "leads_phone_key" ON "public"."leads"("phone");

-- CreateIndex
CREATE INDEX "idx_leads_created_at" ON "public"."leads"("created_at");

-- CreateIndex
CREATE INDEX "idx_leads_phone" ON "public"."leads"("phone");

-- CreateIndex
CREATE INDEX "idx_leads_status" ON "public"."leads"("status");

-- CreateIndex
CREATE INDEX "idx_messages_created_at" ON "public"."messages"("created_at");

-- CreateIndex
CREATE INDEX "idx_messages_direction" ON "public"."messages"("direction");

-- CreateIndex
CREATE INDEX "idx_messages_lead_id" ON "public"."messages"("lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_configuration_config_key_key" ON "public"."ai_configuration"("config_key");

-- CreateIndex
CREATE INDEX "idx_ai_config_key" ON "public"."ai_configuration"("config_key");

-- CreateIndex
CREATE INDEX "idx_knowledge_active" ON "public"."ai_knowledge_base"("is_active");

-- CreateIndex
CREATE INDEX "idx_knowledge_category" ON "public"."ai_knowledge_base"("category");

-- CreateIndex
CREATE INDEX "idx_knowledge_priority" ON "public"."ai_knowledge_base"("priority" DESC);

-- CreateIndex
CREATE INDEX "idx_templates_active" ON "public"."message_templates"("is_active");

-- CreateIndex
CREATE INDEX "idx_templates_category" ON "public"."message_templates"("category");

-- CreateIndex
CREATE INDEX "idx_templates_usage" ON "public"."message_templates"("usage_count" DESC);

-- CreateIndex
CREATE INDEX "idx_proactive_created" ON "public"."proactive_messages"("created_at");

-- CreateIndex
CREATE INDEX "idx_proactive_lead" ON "public"."proactive_messages"("lead_id");

-- CreateIndex
CREATE INDEX "idx_proactive_messages_created_at" ON "public"."proactive_messages"("created_at");

-- CreateIndex
CREATE INDEX "idx_proactive_messages_lead_id" ON "public"."proactive_messages"("lead_id");

-- CreateIndex
CREATE INDEX "idx_proactive_messages_status" ON "public"."proactive_messages"("status");

-- CreateIndex
CREATE INDEX "idx_proactive_phone" ON "public"."proactive_messages"("phone_number");

-- CreateIndex
CREATE INDEX "idx_proactive_status" ON "public"."proactive_messages"("status");

-- CreateIndex
CREATE INDEX "idx_whatsapp_created" ON "public"."whatsapp_conversations"("created_at");

-- CreateIndex
CREATE INDEX "idx_whatsapp_phone" ON "public"."whatsapp_conversations"("phone_number");

-- CreateIndex
CREATE INDEX "idx_whatsapp_session" ON "public"."whatsapp_conversations"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_sessions_session_id_key" ON "public"."whatsapp_sessions"("session_id");

-- CreateIndex
CREATE INDEX "idx_sessions_session_id" ON "public"."whatsapp_sessions"("session_id");

-- CreateIndex
CREATE INDEX "idx_sessions_status" ON "public"."whatsapp_sessions"("status");

-- CreateIndex
CREATE INDEX "idx_sessions_active" ON "public"."whatsapp_sessions"("is_active");

-- CreateIndex
CREATE INDEX "idx_sessions_last_seen" ON "public"."whatsapp_sessions"("last_seen");

-- CreateIndex
CREATE INDEX "idx_sessions_phone" ON "public"."whatsapp_sessions"("connected_number");

-- CreateIndex
CREATE INDEX "idx_whitelist_logs_created" ON "public"."whatsapp_whitelist_logs"("created_at");

-- CreateIndex
CREATE INDEX "idx_whitelist_logs_decision" ON "public"."whatsapp_whitelist_logs"("decision");

-- CreateIndex
CREATE INDEX "idx_whitelist_logs_phone" ON "public"."whatsapp_whitelist_logs"("phone_number");

-- CreateIndex
CREATE INDEX "idx_whitelist_logs_session" ON "public"."whatsapp_whitelist_logs"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "system_variables_key_key" ON "public"."system_variables"("key");

-- CreateIndex
CREATE INDEX "idx_system_variables_key" ON "public"."system_variables"("key");

-- CreateIndex
CREATE INDEX "idx_system_variables_category" ON "public"."system_variables"("category");

-- CreateIndex
CREATE INDEX "idx_system_variables_updated" ON "public"."system_variables"("updated_at");

-- AddForeignKey
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."proactive_messages" ADD CONSTRAINT "proactive_messages_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."proactive_messages" ADD CONSTRAINT "proactive_messages_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."message_templates"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
