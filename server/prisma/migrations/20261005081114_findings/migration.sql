-- CreateEnum
CREATE TYPE "finding_state" AS ENUM ('open', 'resolved', 'ignored');

-- CreateTable
CREATE TABLE "findings" (
    "id" UUID NOT NULL,
    "repository_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "state" "finding_state" NOT NULL DEFAULT 'open',
    "title" TEXT NOT NULL,
    "file" TEXT NOT NULL,
    "start_line" INTEGER NOT NULL,
    "severity" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "change_title" TEXT NOT NULL,
    "author" TEXT,
    "last_job_id" UUID,
    "first_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ,
    "ignored_at" TIMESTAMPTZ,

    CONSTRAINT "findings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "findings_repository_id_state_idx" ON "findings"("repository_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "findings_repository_id_number_fingerprint_key" ON "findings"("repository_id", "number", "fingerprint");

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_last_job_id_fkey" FOREIGN KEY ("last_job_id") REFERENCES "review_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
