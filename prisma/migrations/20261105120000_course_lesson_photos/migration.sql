-- Courses and lessons can show a photo chosen from the gallery. Deleting the photo leaves them
-- without one (they fall back to the course photo, then to a generated cover).
ALTER TABLE "Course" ADD COLUMN "imageId" UUID;
ALTER TABLE "Lesson" ADD COLUMN "imageId" UUID;

CREATE INDEX "Course_imageId_idx" ON "Course"("imageId");
CREATE INDEX "Lesson_imageId_idx" ON "Lesson"("imageId");

ALTER TABLE "Course" ADD CONSTRAINT "Course_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "GalleryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "GalleryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
