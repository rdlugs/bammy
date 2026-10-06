import { prisma } from "../../src/lib/prisma.ts";
import { AUTH_COOKIE, signToken } from "../../src/lib/jwt.ts";
import { WORKSPACE_HEADER } from "../../src/services/workspaces.ts";
import type { InstanceRole, WorkspaceRole } from "../../src/generated/prisma/client.ts";

// A user with their personal workspace, as registration creates them.
export async function createUser(email = "dev@example.com", role: InstanceRole = "member") {
  const user = await prisma.user.create({ data: { name: "Dev", email, passwordHash: "x", role } });
  const workspace = await prisma.workspace.create({
    data: { name: user.name, personalOwnerId: user.id, memberships: { create: { userId: user.id, role: "owner" } } },
  });
  return { user, workspace, cookie: `${AUTH_COOKIE}=${signToken(user.id)}` };
}

export async function createTeam(ownerId: string, name = "Team") {
  return prisma.workspace.create({
    data: { name, memberships: { create: { userId: ownerId, role: "owner" } } },
  });
}

export async function addMember(workspaceId: string, userId: string, role: WorkspaceRole = "member") {
  return prisma.membership.create({ data: { workspaceId, userId, role } });
}

// Header selecting a workspace other than the personal one.
export function inWorkspace(workspaceId: string): [string, string] {
  return [WORKSPACE_HEADER, workspaceId];
}
