-- AlterEnum
ALTER TYPE "EnrollmentSource" ADD VALUE 'COURSE';

-- CreateTable
CREATE TABLE "CourseMember" (
    "id" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourseMember_userId_idx" ON "CourseMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseMember_courseId_userId_key" ON "CourseMember"("courseId", "userId");

-- AddForeignKey
ALTER TABLE "CourseMember" ADD CONSTRAINT "CourseMember_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseMember" ADD CONSTRAINT "CourseMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
