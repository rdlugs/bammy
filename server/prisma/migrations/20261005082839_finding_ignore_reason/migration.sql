-- CreateEnum
CREATE TYPE "ignore_reason" AS ENUM ('false_positive', 'intentional', 'fix_later', 'not_specified');

-- AlterTable
ALTER TABLE "findings" ADD COLUMN     "ignore_note" TEXT,
ADD COLUMN     "ignore_reason" "ignore_reason";
