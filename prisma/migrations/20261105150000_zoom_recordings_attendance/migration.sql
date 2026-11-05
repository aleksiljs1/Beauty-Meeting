-- Zoom cloud recordings are imported automatically: where to download them from, which meeting
-- instance they belong to, and how many attempts have failed.
ALTER TABLE "Recording" ADD COLUMN "providerMeetingUuid" TEXT;
ALTER TABLE "Recording" ADD COLUMN "providerDownloadUrl" TEXT;
ALTER TABLE "Recording" ADD COLUMN "importAttempts" INTEGER NOT NULL DEFAULT 0;

-- Who was in each live class and for how long, from Zoom's participant joined/left events.
CREATE TABLE "LessonAttendance" (
    "id" UUID NOT NULL,
    "lessonId" UUID NOT NULL,
    "userId" TEXT,
    "participantKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "joinedAt" TIMESTAMPTZ(3) NOT NULL,
    "leftAt" TIMESTAMPTZ(3),

    CONSTRAINT "LessonAttendance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LessonAttendance_lessonId_participantKey_joinedAt_key" ON "LessonAttendance"("lessonId", "participantKey", "joinedAt");
CREATE INDEX "LessonAttendance_lessonId_userId_idx" ON "LessonAttendance"("lessonId", "userId");
CREATE INDEX "LessonAttendance_userId_idx" ON "LessonAttendance"("userId");

ALTER TABLE "LessonAttendance" ADD CONSTRAINT "LessonAttendance_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LessonAttendance" ADD CONSTRAINT "LessonAttendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
