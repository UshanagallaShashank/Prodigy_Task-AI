-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "aiUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "suggestedDescription" TEXT,
ADD COLUMN     "suggestedPriority" "Priority" DEFAULT 'MEDIUM',
ADD COLUMN     "updatedPriority" TEXT,
ADD COLUMN     "updatedStatus" TEXT;

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "suggestion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);
