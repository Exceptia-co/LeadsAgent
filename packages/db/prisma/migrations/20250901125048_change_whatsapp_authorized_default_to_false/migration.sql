/*
  Warnings:

  - You are about to drop the column `action` on the `whatsapp_whitelist_logs` table. All the data in the column will be lost.
  - You are about to alter the column `decision` on the `whatsapp_whitelist_logs` table. The data in that column could be lost. The data in that column will be cast from `VarChar(50)` to `VarChar(20)`.
  - You are about to drop the `system_variables` table. If the table is not empty, all the data it contains will be lost.
  - Made the column `decision` on table `whatsapp_whitelist_logs` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "public"."leads" ALTER COLUMN "whatsapp_authorized" SET DEFAULT false;

-- AlterTable
ALTER TABLE "public"."whatsapp_whitelist_logs" DROP COLUMN "action",
ADD COLUMN     "ai_provider" VARCHAR(50),
ADD COLUMN     "ip_address" VARCHAR(45),
ADD COLUMN     "lead_id" VARCHAR(255),
ADD COLUMN     "lead_name" VARCHAR(255),
ADD COLUMN     "message_preview" TEXT,
ADD COLUMN     "user_agent" TEXT,
ALTER COLUMN "decision" SET NOT NULL,
ALTER COLUMN "decision" SET DATA TYPE VARCHAR(20);

-- DropTable
DROP TABLE "public"."system_variables";

-- CreateIndex
CREATE INDEX "idx_whitelist_logs_lead_id" ON "public"."whatsapp_whitelist_logs"("lead_id");
