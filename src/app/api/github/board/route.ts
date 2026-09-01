import { NextResponse } from "next/server";
import { getAuthorizedConnection } from "@/lib/connections";
import { githubClient } from "@/lib/github";
import { apiError, HttpError, requireApiSession } from "@/lib/http";

export async function GET(request: Request) {
  try {
    requireApiSession(request);
    const params = new URL(request.url).searchParams;
    const connectionId = params.get("connectionId");
    const repository = params.get("repository");
    const projectId = params.get("projectId");
    if (!connectionId || !repository) throw new HttpError(400, "connectionId and repository are required");
    const connection = getAuthorizedConnection(connectionId, repository);
    const client = githubClient(connection.token);
    const board = projectId
      ? await client.getProjectBoard(projectId, repository)
      : await client.getRepositoryBoard(repository);
    return NextResponse.json({ board });
  } catch (error) {
    return apiError(error);
  }
}
