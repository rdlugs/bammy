import type { WorkspaceRole } from "../generated/prisma/client.ts";

// Higher ranks can do everything lower ones can. Who may do what:
// - member: view everything, trigger and rerun reviews, triage findings
// - admin: also forge connections, repositories, review config, LLM keys,
//   inviting and removing members
// - owner: also rename or delete the workspace and grant or revoke owner
const RANK: Record<WorkspaceRole, number> = { member: 0, admin: 1, owner: 2 };

export function atLeast(role: WorkspaceRole, required: WorkspaceRole): boolean {
  return RANK[role] >= RANK[required];
}
