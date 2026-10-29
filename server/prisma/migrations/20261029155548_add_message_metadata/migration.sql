-- CreateEnum
CREATE TYPE "message_status" AS ENUM ('streaming', 'complete', 'failed');

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "model" TEXT,
ADD COLUMN     "sources" JSONB,
ADD COLUMN     "status" "message_status" NOT NULL DEFAULT 'complete';
