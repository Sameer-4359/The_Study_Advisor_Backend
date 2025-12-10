-- CreateEnum
CREATE TYPE "EducationLevel" AS ENUM ('HIGH_SCHOOL', 'BACHELORS', 'MASTERS', 'PHD', 'POST_DOCTORAL');

-- CreateEnum
CREATE TYPE "StudyMode" AS ENUM ('FULL_TIME', 'PART_TIME', 'ONLINE', 'HYBRID');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" TEXT DEFAULT 'student';

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "phoneNumber" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "nationality" TEXT,
    "gender" TEXT,
    "currentEducationLevel" "EducationLevel",
    "institutionName" TEXT,
    "fieldOfStudy" TEXT,
    "ieltsScore" DOUBLE PRECISION,
    "cgpa" DOUBLE PRECISION,
    "academicYear" INTEGER,
    "desiredProgram" TEXT,
    "preferredCountry" TEXT,
    "budgetRangeMin" INTEGER,
    "budgetRangeMax" INTEGER,
    "preferredIntake" TEXT,
    "studyMode" "StudyMode",
    "workExperience" INTEGER,
    "researchExperience" BOOLEAN DEFAULT false,
    "publications" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
