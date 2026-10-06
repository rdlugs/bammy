-- Workspaces take over ownership from users: every existing user gets a
-- personal workspace, and their connections, LLM credentials and global review
-- config move into it unchanged.

-- CreateEnum
CREATE TYPE "workspace_role" AS ENUM ('owner', 'admin', 'member');

-- CreateTable
CREATE TABLE "workspaces" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "personal_owner_id" UUID,
    "review_settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "role" "workspace_role" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspaces_personal_owner_id_key" ON "workspaces"("personal_owner_id");
CREATE INDEX "memberships_workspace_id_idx" ON "memberships"("workspace_id");
CREATE UNIQUE INDEX "memberships_user_id_workspace_id_key" ON "memberships"("user_id", "workspace_id");

ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_personal_owner_id_fkey" FOREIGN KEY ("personal_owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: one personal workspace and owner membership per user.
INSERT INTO "workspaces" ("id", "name", "personal_owner_id", "review_settings", "created_at", "updated_at")
SELECT gen_random_uuid(), "name", "id", "review_settings", "created_at", now() FROM "users";

INSERT INTO "memberships" ("id", "user_id", "workspace_id", "role", "created_at")
SELECT gen_random_uuid(), "personal_owner_id", "id", 'owner', "created_at" FROM "workspaces";

-- Forge connections move to their owner's personal workspace.
ALTER TABLE "forge_connections" DROP CONSTRAINT "forge_connections_user_id_fkey";
DROP INDEX "forge_connections_user_id_idx";
ALTER TABLE "forge_connections" ADD COLUMN "workspace_id" UUID, ADD COLUMN "created_by_id" UUID;
UPDATE "forge_connections" c
SET "workspace_id" = w."id", "created_by_id" = c."user_id"
FROM "workspaces" w WHERE w."personal_owner_id" = c."user_id";
ALTER TABLE "forge_connections" ALTER COLUMN "workspace_id" SET NOT NULL, DROP COLUMN "user_id";
CREATE INDEX "forge_connections_workspace_id_idx" ON "forge_connections"("workspace_id");
ALTER TABLE "forge_connections" ADD CONSTRAINT "forge_connections_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "forge_connections" ADD CONSTRAINT "forge_connections_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- LLM credentials likewise.
ALTER TABLE "llm_credentials" DROP CONSTRAINT "llm_credentials_user_id_fkey";
DROP INDEX "llm_credentials_user_id_provider_key";
ALTER TABLE "llm_credentials" ADD COLUMN "workspace_id" UUID;
UPDATE "llm_credentials" k
SET "workspace_id" = w."id"
FROM "workspaces" w WHERE w."personal_owner_id" = k."user_id";
ALTER TABLE "llm_credentials" ALTER COLUMN "workspace_id" SET NOT NULL, DROP COLUMN "user_id";
CREATE UNIQUE INDEX "llm_credentials_workspace_id_provider_key" ON "llm_credentials"("workspace_id", "provider");
ALTER TABLE "llm_credentials" ADD CONSTRAINT "llm_credentials_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The global review config now lives on the workspace (copied above).
ALTER TABLE "users" DROP COLUMN "review_settings";

-- Invites can now add someone to a workspace with a role; both or neither.
ALTER TABLE "invites" ADD COLUMN "workspace_id" UUID, ADD COLUMN "role" "workspace_role";
ALTER TABLE "invites" ADD CONSTRAINT "invites_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invites" ADD CONSTRAINT "invites_workspace_role_check" CHECK (("workspace_id" IS NULL) = ("role" IS NULL));
