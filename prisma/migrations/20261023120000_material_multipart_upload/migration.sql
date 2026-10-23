-- Multipart uploads for large lesson materials (MP4 videos).
ALTER TABLE "LessonMaterial" ADD COLUMN "uploadId" TEXT;
