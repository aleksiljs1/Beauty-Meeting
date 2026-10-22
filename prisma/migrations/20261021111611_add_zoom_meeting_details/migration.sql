/*
  Warnings:

  - A unique constraint covering the columns `[zoomMeetingNumber]` on the table `Lesson` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[zoomMeetingUuid]` on the table `Lesson` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "zoomMeetingNumber" TEXT,
ADD COLUMN     "zoomMeetingPassword" TEXT,
ADD COLUMN     "zoomMeetingUuid" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Lesson_zoomMeetingNumber_key" ON "Lesson"("zoomMeetingNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Lesson_zoomMeetingUuid_key" ON "Lesson"("zoomMeetingUuid");
