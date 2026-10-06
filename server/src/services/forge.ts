import { HttpError } from "../lib/httpError.ts";
import { prisma } from "../lib/prisma.ts";
import type { ForgeConnection } from "../generated/prisma/client.ts";
import { ForgeError } from "../review/forge/http.ts";
import { forgeName } from "../review/forge/providers.ts";
import { providerFor, type Forge } from "./providers/index.ts";

export type { Forge } from "./providers/index.ts";

export function adapterForConnection(connection: ForgeConnection): Forge {
  return providerFor(connection.provider).adapterFor(connection);
}

export async function loadWorkspaceConnection(workspaceId: string, id: string): Promise<ForgeConnection> {
  const connection = await prisma.forgeConnection.findFirst({ where: { id, workspaceId } });
  if (!connection) {
    throw new HttpError(404, "Connection not found");
  }
  return connection;
}

// Translates a forge failure into something the user can act on. A forge
// refusing our credentials is a broken connection, not a 401 from Bammy.
export function toHttpError(err: unknown, providerId: string): unknown {
  if (!(err instanceof ForgeError)) {
    return err;
  }
  const provider = forgeName(providerId);
  if (err.status === 401 || err.status === 403) {
    return new HttpError(502, `${provider} rejected the stored credentials; reconnect the account`);
  }
  if (err.status === 404) {
    return new HttpError(404, `Not found on ${provider}`);
  }
  return new HttpError(502, `${provider} request failed`);
}
