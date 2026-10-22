/*
  Warnings:

  - You are about to drop the column `zoomMeetingPassword` on the `Lesson` table. All the data in the column will be lost.
  - You are about to drop the column `zoomMeetingUuid` on the `Lesson` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "WebhookEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED');

-- DropIndex
DROP INDEX "Lesson_zoomMeetingUuid_key";

-- AlterTable
ALTER TABLE "Lesson" DROP COLUMN "zoomMeetingPassword",
DROP COLUMN "zoomMeetingUuid",
ADD COLUMN     "zoomPasscodeEncrypted" TEXT,
ADD COLUMN     "zoomProvisioningStartedAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "meetingNumber" TEXT,
    "eventTs" BIGINT NOT NULL,
    "status" "WebhookEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "note" TEXT,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(3),

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_dedupeKey_key" ON "WebhookEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "WebhookEvent_provider_meetingNumber_eventTs_idx" ON "WebhookEvent"("provider", "meetingNumber", "eventTs");

-- CreateIndex
CREATE INDEX "WebhookEvent_status_receivedAt_idx" ON "WebhookEvent"("status", "receivedAt");
