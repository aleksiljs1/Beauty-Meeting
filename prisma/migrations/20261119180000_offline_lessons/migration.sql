-- CreateEnum
CREATE TYPE "LessonFormat" AS ENUM ('LIVE', 'OFFLINE');

-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN "format" "LessonFormat" NOT NULL DEFAULT 'LIVE';

-- CreateTable
CREATE TABLE "MaterialProgress" (
    "userId" TEXT NOT NULL,
    "lessonMaterialId" UUID NOT NULL,
    "seenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialProgress_pkey" PRIMARY KEY ("userId","lessonMaterialId")
);

-- CreateIndex
CREATE INDEX "MaterialProgress_lessonMaterialId_idx" ON "MaterialProgress"("lessonMaterialId");

-- AddForeignKey
ALTER TABLE "MaterialProgress" ADD CONSTRAINT "MaterialProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialProgress" ADD CONSTRAINT "MaterialProgress_lessonMaterialId_fkey" FOREIGN KEY ("lessonMaterialId") REFERENCES "LessonMaterial"("id") ON DELETE CASCADE ON UPDATE CASCADE;
