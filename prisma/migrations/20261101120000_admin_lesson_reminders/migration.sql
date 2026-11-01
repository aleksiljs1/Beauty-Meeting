-- Each admin can ask for an email some time before every lesson starts.
CREATE TABLE "AdminPreferences" (
    "userId" TEXT NOT NULL,
    "lessonReminderEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lessonReminderMinutes" INTEGER NOT NULL DEFAULT 60,
    "reminderEmail" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AdminPreferences_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "AdminPreferences" ADD CONSTRAINT "AdminPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Reminders already sent (per admin, lesson and start time), so none goes out twice.
CREATE TABLE "AdminLessonReminder" (
    "userId" TEXT NOT NULL,
    "lessonId" UUID NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "sentAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminLessonReminder_pkey" PRIMARY KEY ("userId","lessonId","startsAt")
);

CREATE INDEX "AdminLessonReminder_lessonId_idx" ON "AdminLessonReminder"("lessonId");

ALTER TABLE "AdminLessonReminder" ADD CONSTRAINT "AdminLessonReminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdminLessonReminder" ADD CONSTRAINT "AdminLessonReminder_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
