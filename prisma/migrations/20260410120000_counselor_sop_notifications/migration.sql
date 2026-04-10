-- CreateEnum
CREATE TYPE "SOPStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'REVISION_REQUESTED', 'APPROVED');

-- CreateEnum
CREATE TYPE "ActivityEventType" AS ENUM ('PROFILE_UPDATED', 'DOCUMENT_UPLOADED', 'DOCUMENT_UPDATED', 'DOCUMENT_DELETED', 'SOP_DRAFT_SAVED', 'SOP_SUBMITTED', 'SOP_REVIEWED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('PROFILE', 'DOCUMENT', 'SOP', 'SYSTEM');

-- CreateTable
CREATE TABLE "StatementOfPurpose" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "documentId" INTEGER,
    "version" INTEGER NOT NULL,
    "title" TEXT,
    "content" TEXT,
    "status" "SOPStatus" NOT NULL DEFAULT 'DRAFT',
    "reviewNotes" TEXT,
    "reviewedBy" INTEGER,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StatementOfPurpose_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SOPReviewComment" (
    "id" SERIAL NOT NULL,
    "sopId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SOPReviewComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentActivityEvent" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "actorId" INTEGER,
    "eventType" "ActivityEventType" NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CounselorNotification" (
    "id" SERIAL NOT NULL,
    "counselorId" INTEGER NOT NULL,
    "studentId" INTEGER,
    "activityEventId" INTEGER,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CounselorNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StatementOfPurpose_userId_status_createdAt_idx" ON "StatementOfPurpose"("userId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StatementOfPurpose_userId_version_key" ON "StatementOfPurpose"("userId", "version");

-- CreateIndex
CREATE INDEX "SOPReviewComment_sopId_createdAt_idx" ON "SOPReviewComment"("sopId", "createdAt");

-- CreateIndex
CREATE INDEX "StudentActivityEvent_studentId_createdAt_idx" ON "StudentActivityEvent"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "StudentActivityEvent_eventType_createdAt_idx" ON "StudentActivityEvent"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "CounselorNotification_counselorId_isRead_createdAt_idx" ON "CounselorNotification"("counselorId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "CounselorNotification_studentId_createdAt_idx" ON "CounselorNotification"("studentId", "createdAt");

-- AddForeignKey
ALTER TABLE "StatementOfPurpose" ADD CONSTRAINT "StatementOfPurpose_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatementOfPurpose" ADD CONSTRAINT "StatementOfPurpose_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatementOfPurpose" ADD CONSTRAINT "StatementOfPurpose_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SOPReviewComment" ADD CONSTRAINT "SOPReviewComment_sopId_fkey" FOREIGN KEY ("sopId") REFERENCES "StatementOfPurpose"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SOPReviewComment" ADD CONSTRAINT "SOPReviewComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentActivityEvent" ADD CONSTRAINT "StudentActivityEvent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentActivityEvent" ADD CONSTRAINT "StudentActivityEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounselorNotification" ADD CONSTRAINT "CounselorNotification_counselorId_fkey" FOREIGN KEY ("counselorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounselorNotification" ADD CONSTRAINT "CounselorNotification_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounselorNotification" ADD CONSTRAINT "CounselorNotification_activityEventId_fkey" FOREIGN KEY ("activityEventId") REFERENCES "StudentActivityEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

