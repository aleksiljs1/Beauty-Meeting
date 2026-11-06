-- When a class's Zoom recording was found: the catch-up never re-imports a deleted one.
ALTER TABLE "Lesson" ADD COLUMN "zoomRecordingsQueuedAt" TIMESTAMPTZ(3);

-- Classes whose Zoom recording was already found (and possibly deleted since) count as found.
UPDATE "Lesson" l SET "zoomRecordingsQueuedAt" = now()
WHERE EXISTS (SELECT 1 FROM "Recording" r WHERE r."lessonId" = l.id AND r.source = 'ZOOM');
