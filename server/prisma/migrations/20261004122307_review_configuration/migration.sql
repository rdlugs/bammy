-- AlterTable
ALTER TABLE "repositories" ADD COLUMN     "follow_global" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "review_settings" JSONB NOT NULL DEFAULT '{}';

-- Repositories that already have saved overrides keep using them.
UPDATE "repositories" SET "follow_global" = false WHERE "settings" <> '{}'::jsonb;
