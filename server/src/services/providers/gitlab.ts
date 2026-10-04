import { decrypt } from "../../lib/crypto.ts";
import { HttpError } from "../../lib/httpError.ts";
import { parseJson, REVIEW_COMMAND, safeEqual } from "../../lib/webhook.ts";
import type { ForgeConnection } from "../../generated/prisma/client.ts";
import { GitLabAdapter } from "../../review/forge/gitlab.ts";
import { gitlabConnectSchema } from "../../schemas/connections.schema.ts";
import { enqueue, enqueueFromWebhook } from "../../worker/queue.ts";
import type { ProviderDefinition } from "./types.ts";

const DEVELOPER = 30;

interface GitLabPayload {
  object_kind?: string;
  user?: { id: number };
  object_attributes?: {
    action?: string;
    iid?: number;
    oldrev?: string;
    noteable_type?: string;
    note?: string;
    last_commit?: { id: string };
  };
  merge_request?: { iid: number; last_commit: { id: string } };
}

function adapterFor(connection: ForgeConnection): GitLabAdapter {
  const encryptedToken = connection.encryptedToken;
  if (!encryptedToken) {
    throw new HttpError(500, "GitLab connection has no token");
  }
  return new GitLabAdapter({
    host: connection.host,
    token: async () => decrypt(encryptedToken),
    selfLogin: connection.accountLogin,
  });
}

export const gitlabProvider: ProviderDefinition = {
  adapterFor,

  tokenConnect: {
    schema: gitlabConnectSchema,
    account: (host, token) => new GitLabAdapter({ host, token: async () => token }).currentAccount(),
  },

  repoWebhook: {
    verify: (header, _raw, secret) => safeEqual(header("x-gitlab-token") ?? "", secret),

    async handle(repo, header, raw) {
      if (!repo.enabled) return { body: { outcome: "not_enabled" } };

      const event = header("x-gitlab-event");
      const payload = parseJson<GitLabPayload>(raw);
      const attrs = payload.object_attributes ?? {};

      if (event === "Merge Request Hook") {
        // An update only matters when it brought new commits (oldrev is set).
        const relevant =
          attrs.action === "open" || attrs.action === "reopen" || (attrs.action === "update" && attrs.oldrev);
        if (!relevant || !attrs.iid || !attrs.last_commit) return { body: { outcome: "ignored" } };
        const result = await enqueueFromWebhook({
          repositoryId: repo.id,
          number: attrs.iid,
          headSha: attrs.last_commit.id,
          trigger: "webhook",
        });
        return { body: result.queued ? { outcome: "queued", reviewId: result.job.id } : { outcome: result.reason } };
      }

      if (event === "Note Hook" && attrs.noteable_type === "MergeRequest" && REVIEW_COMMAND.test(attrs.note ?? "")) {
        const mr = payload.merge_request;
        if (!mr || !payload.user) return { body: { outcome: "ignored" } };
        // GitLab's note payload does not say what the author may do; ask.
        const level = await adapterFor(repo.connection).memberAccessLevel(repo.externalId, payload.user.id);
        if (level < DEVELOPER) return { body: { outcome: "not_allowed" } };
        const job = await enqueue({ repositoryId: repo.id, number: mr.iid, headSha: mr.last_commit.id, trigger: "comment" });
        return { body: { outcome: "queued", reviewId: job.id } };
      }

      return { body: { outcome: "ignored" } };
    },
  },
};
