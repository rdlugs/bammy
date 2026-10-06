import { Router } from "express";
import {
  addMember,
  createWorkspace,
  createWorkspaceInvite,
  deleteWorkspace,
  listMemberCandidates,
  listMembers,
  listWorkspaceInvites,
  listWorkspaces,
  removeMember,
  renameWorkspace,
  resendWorkspaceInvite,
  revokeWorkspaceInvite,
  updateMember,
} from "../controllers/workspaces.controller.ts";
import { requireAuth } from "../middleware/requireAuth.ts";
import { userLimiter } from "../middleware/apiLimiter.ts";

// The workspace is named in the path here, not the header: these routes manage
// workspaces rather than act inside the current one. Each handler checks the
// caller's membership and role.
export const workspacesRouter = Router();

workspacesRouter.use(userLimiter, requireAuth);
workspacesRouter.get("/", listWorkspaces);
workspacesRouter.post("/", createWorkspace);
workspacesRouter.patch("/:id", renameWorkspace);
workspacesRouter.delete("/:id", deleteWorkspace);
workspacesRouter.get("/:id/members", listMembers);
workspacesRouter.post("/:id/members", addMember);
workspacesRouter.get("/:id/member-candidates", listMemberCandidates);
workspacesRouter.patch("/:id/members/:userId", updateMember);
workspacesRouter.delete("/:id/members/:userId", removeMember);
workspacesRouter.get("/:id/invites", listWorkspaceInvites);
workspacesRouter.post("/:id/invites", createWorkspaceInvite);
workspacesRouter.post("/:id/invites/:inviteId/resend", resendWorkspaceInvite);
workspacesRouter.delete("/:id/invites/:inviteId", revokeWorkspaceInvite);
