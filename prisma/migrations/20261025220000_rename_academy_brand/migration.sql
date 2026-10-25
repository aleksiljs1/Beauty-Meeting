ALTER TABLE "AcademySettings"
    ALTER COLUMN "name" SET DEFAULT 'Akademia CEM';

UPDATE "AcademySettings"
SET "name" = 'Akademia CEM',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "name" = 'Beauty Academy';
