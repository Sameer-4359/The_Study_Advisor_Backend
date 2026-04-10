-- CreateTable
CREATE TABLE IF NOT EXISTS "CounselorProfile" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "phone" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 20,
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CounselorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CounselorStudentAssignment" (
    "id" SERIAL NOT NULL,
    "counselorId" INTEGER NOT NULL,
    "studentId" INTEGER NOT NULL,
    "assignedBy" INTEGER,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CounselorStudentAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CounselorProfile_userId_key" ON "CounselorProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CounselorStudentAssignment_studentId_key" ON "CounselorStudentAssignment"("studentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CounselorStudentAssignment_counselorId_status_idx" ON "CounselorStudentAssignment"("counselorId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CounselorStudentAssignment_studentId_status_idx" ON "CounselorStudentAssignment"("studentId", "status");

-- AddForeignKey
ALTER TABLE "CounselorProfile"
ADD CONSTRAINT "CounselorProfile_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounselorStudentAssignment"
ADD CONSTRAINT "CounselorStudentAssignment_counselorId_fkey"
FOREIGN KEY ("counselorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounselorStudentAssignment"
ADD CONSTRAINT "CounselorStudentAssignment_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounselorStudentAssignment"
ADD CONSTRAINT "CounselorStudentAssignment_assignedBy_fkey"
FOREIGN KEY ("assignedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add columns on existing universities table for partnership lifecycle.
ALTER TABLE "universities"
ADD COLUMN IF NOT EXISTS "is_partnered" BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS "partnered_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "partnership_notes" TEXT,
ADD COLUMN IF NOT EXISTS "created_by_admin_id" INTEGER,
ADD COLUMN IF NOT EXISTS "city" TEXT,
ADD COLUMN IF NOT EXISTS "application_fee_usd" DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS "universities_is_partnered_idx" ON "universities"("is_partnered");