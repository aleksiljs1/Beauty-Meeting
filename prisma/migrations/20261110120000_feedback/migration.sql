-- Students rate ended lessons, ended courses and the app itself (1-5 stars, optional comment).
CREATE TYPE "FeedbackTopic" AS ENUM ('LESSON', 'COURSE', 'APP');

CREATE TABLE "Feedback" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "topic" "FeedbackTopic" NOT NULL,
    "lessonId" UUID,
    "courseId" UUID,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Feedback_rating_check" CHECK ("rating" BETWEEN 1 AND 5),
    -- A lesson rating names only its lesson, a course rating only its course, app feedback neither.
    CONSTRAINT "Feedback_target_check" CHECK (
        ("topic" = 'LESSON' AND "lessonId" IS NOT NULL AND "courseId" IS NULL) OR
        ("topic" = 'COURSE' AND "courseId" IS NOT NULL AND "lessonId" IS NULL) OR
        ("topic" = 'APP' AND "lessonId" IS NULL AND "courseId" IS NULL)
    )
);

-- One rating per student per lesson and per course (NULLs are distinct, so app feedback repeats).
CREATE UNIQUE INDEX "Feedback_userId_lessonId_key" ON "Feedback"("userId", "lessonId");
CREATE UNIQUE INDEX "Feedback_userId_courseId_key" ON "Feedback"("userId", "courseId");
CREATE INDEX "Feedback_lessonId_idx" ON "Feedback"("lessonId");
CREATE INDEX "Feedback_courseId_idx" ON "Feedback"("courseId");
CREATE INDEX "Feedback_topic_createdAt_idx" ON "Feedback"("topic", "createdAt");

ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
