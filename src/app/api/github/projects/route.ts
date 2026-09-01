import { NextResponse } from "next/server";
import { getAuthorizedConnection } from "@/lib/connections";
import { githubClient } from "@/lib/github";
import { apiError, HttpError, requireApiSession } from "@/lib/http";

export async function GET(request: Request) {
  try {
    requireApiSession(request);
    const params = new URL(request.url).searchParams;
    const connectionId = params.get("connectionId");
    if (!connectionId) throw new HttpError(400, "connectionId is required");
    const repository = params.get("repository") || undefined;
    const connection = getAuthorizedConnection(connectionId, repository);
    const projects = await githubClient(connection.token).listProjects(connection, repository);
    return NextResponse.json({ projects });
  } catch (error) {
    return apiError(error);
  }
}
