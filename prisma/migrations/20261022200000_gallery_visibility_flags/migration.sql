ALTER TABLE "GalleryItem"
ADD COLUMN "showInGallery" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "showOnHomeHero" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "showOnHomeGallery" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "showOnAbout" BOOLEAN NOT NULL DEFAULT false;

UPDATE "GalleryItem"
SET
  "showInGallery" = ("placement" = 'GALLERY'),
  "showOnHomeHero" = ("placement" = 'HOME_HERO'),
  "showOnHomeGallery" = ("placement" = 'HOME_GALLERY'),
  "showOnAbout" = ("placement" = 'ABOUT');

DROP INDEX "GalleryItem_isPublished_placement_position_idx";

ALTER TABLE "GalleryItem"
DROP COLUMN "placement";

DROP TYPE "GalleryPlacement";

CREATE INDEX "GalleryItem_isPublished_showInGallery_position_idx"
ON "GalleryItem"("isPublished", "showInGallery", "position");

CREATE INDEX "GalleryItem_isPublished_showOnHomeHero_position_idx"
ON "GalleryItem"("isPublished", "showOnHomeHero", "position");

CREATE INDEX "GalleryItem_isPublished_showOnHomeGallery_position_idx"
ON "GalleryItem"("isPublished", "showOnHomeGallery", "position");

CREATE INDEX "GalleryItem_isPublished_showOnAbout_position_idx"
ON "GalleryItem"("isPublished", "showOnAbout", "position");
