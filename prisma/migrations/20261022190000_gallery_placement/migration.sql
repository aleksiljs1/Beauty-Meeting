CREATE TYPE "GalleryPlacement" AS ENUM ('GALLERY', 'HOME_HERO', 'HOME_GALLERY', 'ABOUT');

ALTER TABLE "GalleryItem"
ADD COLUMN "placement" "GalleryPlacement" NOT NULL DEFAULT 'GALLERY';

CREATE INDEX "GalleryItem_isPublished_placement_position_idx"
ON "GalleryItem"("isPublished", "placement", "position");
