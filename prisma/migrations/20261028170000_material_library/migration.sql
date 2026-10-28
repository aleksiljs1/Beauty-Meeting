-- Materials library: each stored file becomes a MaterialFile; LessonMaterial becomes a link
-- from a lesson to a file. Existing materials keep their ids (file id = old material id), so
-- nothing is re-uploaded and no stored object changes.

-- CreateTable
CREATE TABLE "MaterialFile" (
    "id" UUID NOT NULL,
    "objectKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "status" "ObjectStatus" NOT NULL DEFAULT 'PENDING',
    "uploadId" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MaterialFile_pkey" PRIMARY KEY ("id")
);

-- Move every existing material into the library.
INSERT INTO "MaterialFile" ("id", "objectKey", "displayName", "mimeType", "sizeBytes", "status", "uploadId", "uploadedById", "createdAt", "updatedAt")
SELECT "id", "objectKey", "displayName", "mimeType", "sizeBytes", "status", "uploadId", "uploadedById", "createdAt", "updatedAt" FROM "LessonMaterial";

-- Link each lesson to its (now library) file.
ALTER TABLE "LessonMaterial" ADD COLUMN "fileId" UUID;
UPDATE "LessonMaterial" SET "fileId" = "id";
ALTER TABLE "LessonMaterial" ALTER COLUMN "fileId" SET NOT NULL;

-- DropForeignKey
ALTER TABLE "LessonMaterial" DROP CONSTRAINT "LessonMaterial_uploadedById_fkey";

-- DropIndex
DROP INDEX "LessonMaterial_lessonId_status_position_idx";
DROP INDEX "LessonMaterial_objectKey_key";

-- AlterTable
ALTER TABLE "LessonMaterial" DROP COLUMN "displayName",
DROP COLUMN "mimeType",
DROP COLUMN "objectKey",
DROP COLUMN "sizeBytes",
DROP COLUMN "status",
DROP COLUMN "updatedAt",
DROP COLUMN "uploadId",
DROP COLUMN "uploadedById";

-- CreateIndex
CREATE UNIQUE INDEX "MaterialFile_objectKey_key" ON "MaterialFile"("objectKey");
CREATE INDEX "MaterialFile_status_createdAt_idx" ON "MaterialFile"("status", "createdAt");
CREATE INDEX "LessonMaterial_lessonId_position_idx" ON "LessonMaterial"("lessonId", "position");
CREATE INDEX "LessonMaterial_fileId_idx" ON "LessonMaterial"("fileId");
CREATE UNIQUE INDEX "LessonMaterial_lessonId_fileId_key" ON "LessonMaterial"("lessonId", "fileId");

-- AddForeignKey
ALTER TABLE "MaterialFile" ADD CONSTRAINT "MaterialFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LessonMaterial" ADD CONSTRAINT "LessonMaterial_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "MaterialFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
