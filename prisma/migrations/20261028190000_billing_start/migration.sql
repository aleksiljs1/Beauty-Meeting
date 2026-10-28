-- Where each student's billing starts now lives in its own table, so it survives the student
-- being taken off a course and added back (their payments keep covering the same months).
CREATE TABLE "BillingStart" (
    "courseId" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "firstMonth" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "BillingStart_pkey" PRIMARY KEY ("courseId","userId")
);

CREATE INDEX "BillingStart_userId_idx" ON "BillingStart"("userId");

ALTER TABLE "BillingStart" ADD CONSTRAINT "BillingStart_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BillingStart" ADD CONSTRAINT "BillingStart_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep every current member's value before the old column goes.
INSERT INTO "BillingStart" ("courseId", "userId", "firstMonth")
SELECT "courseId", "userId", "firstMonth" FROM "CourseMember";

ALTER TABLE "CourseMember" DROP COLUMN "firstMonth";

-- Deleting a student must not erase their payments: block it (the admin deactivates instead).
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_userId_fkey";

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
