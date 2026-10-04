-- AlterEnum
ALTER TYPE "review_status" ADD VALUE 'skipped';

-- AlterTable
ALTER TABLE "repositories" ADD COLUMN     "encrypted_webhook_secret" TEXT,
ADD COLUMN     "webhook_id" TEXT;
