-- CreateEnum
CREATE TYPE "forge_provider" AS ENUM ('github', 'gitlab');

-- CreateEnum
CREATE TYPE "connection_kind" AS ENUM ('github_app', 'token');

-- CreateEnum
CREATE TYPE "review_trigger" AS ENUM ('manual', 'webhook', 'comment');

-- CreateEnum
CREATE TYPE "review_status" AS ENUM ('queued', 'running', 'completed', 'partial', 'failed', 'superseded');

-- CreateEnum
CREATE TYPE "review_verdict" AS ENUM ('pass', 'blocked', 'error');

-- CreateTable
CREATE TABLE "forge_connections" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" "forge_provider" NOT NULL,
    "host" TEXT NOT NULL,
    "kind" "connection_kind" NOT NULL,
    "installation_id" TEXT,
    "encrypted_token" TEXT,
    "account_login" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "forge_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repositories" (
    "id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "provider" "forge_provider" NOT NULL,
    "host" TEXT NOT NULL,
    "full_path" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "default_branch" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "repositories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_jobs" (
    "id" UUID NOT NULL,
    "repository_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "head_sha" TEXT NOT NULL,
    "base_sha" TEXT,
    "trigger" "review_trigger" NOT NULL,
    "status" "review_status" NOT NULL DEFAULT 'queued',
    "verdict" "review_verdict",
    "resolved_config" JSONB,
    "result" JSONB,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_at" TIMESTAMPTZ,
    "started_at" TIMESTAMPTZ,
    "finished_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posted_findings" (
    "id" UUID NOT NULL,
    "repository_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "forge_comment_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "posted_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "llm_credentials" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "encrypted_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "llm_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "forge_connections_user_id_idx" ON "forge_connections"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "repositories_connection_id_external_id_key" ON "repositories"("connection_id", "external_id");

-- CreateIndex
CREATE INDEX "review_jobs_status_created_at_idx" ON "review_jobs"("status", "created_at");

-- CreateIndex
CREATE INDEX "review_jobs_repository_id_number_idx" ON "review_jobs"("repository_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "posted_findings_repository_id_number_fingerprint_key" ON "posted_findings"("repository_id", "number", "fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "llm_credentials_user_id_provider_key" ON "llm_credentials"("user_id", "provider");

-- AddForeignKey
ALTER TABLE "forge_connections" ADD CONSTRAINT "forge_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "forge_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_jobs" ADD CONSTRAINT "review_jobs_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posted_findings" ADD CONSTRAINT "posted_findings_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llm_credentials" ADD CONSTRAINT "llm_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
