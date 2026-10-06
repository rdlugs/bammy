import type { NextFunction, Request, Response } from "express";
import type { WorkspaceRole } from "../generated/prisma/client.ts";
import { loadMembership, requireRole, WORKSPACE_HEADER } from "../services/workspaces.ts";

declare global {
  namespace Express {
    interface Request {
      workspaceId?: string;
      workspaceRole?: WorkspaceRole;
    }
  }
}

// Runs after requireAuth. Without the header the request acts on the user's
// personal workspace, so scripts written before workspaces keep working. The
// membership is read on every request, so removal takes effect immediately.
export async function requireWorkspace(req: Request, _res: Response, next: NextFunction) {
  const access = await loadMembership(req.userId!, req.get(WORKSPACE_HEADER));
  req.workspaceId = access.workspaceId;
  req.workspaceRole = access.role;
  next();
}

export function requireWorkspaceRole(required: WorkspaceRole) {
  return (req: Request, _res: Response, next: NextFunction) => {
    requireRole(req.workspaceRole!, required);
    next();
  };
}
