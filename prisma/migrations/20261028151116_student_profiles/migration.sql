-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('FEMALE', 'MALE', 'OTHER');

-- CreateTable
CREATE TABLE "StudentProfile" (
    "userId" TEXT NOT NULL,
    "phone" TEXT,
    "birthDate" DATE,
    "gender" "Gender",
    "city" TEXT,
    "notes" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StudentProfile_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
