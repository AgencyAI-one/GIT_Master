import { getConnection } from "./db";
import { HttpError } from "./http";

export function getAuthorizedConnection(connectionId: string, repository?: string) {
  const connection = getConnection(connectionId);
  if (!connection) throw new HttpError(404, "Connection not found");
  if (!repository || connection.scopeType === "account") return connection;

  const [owner, name, ...extra] = repository.split("/");
  if (!owner || !name || extra.length) throw new HttpError(400, "Repository must use owner/name format");
  const normalizedOwner = owner.toLowerCase();
  const normalizedRepository = name.toLowerCase();

  if (connection.scopeType === "organization" && normalizedOwner !== connection.owner?.toLowerCase()) {
    throw new HttpError(403, "Repository is outside this organization connection");
  }
  if (
    connection.scopeType === "repository" &&
    (normalizedOwner !== connection.owner?.toLowerCase() || normalizedRepository !== connection.repository?.toLowerCase())
  ) {
    throw new HttpError(403, "Repository is outside this repository connection");
  }
  return connection;
}
