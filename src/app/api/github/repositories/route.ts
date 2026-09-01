import { NextResponse } from "next/server";
import { getConnection } from "@/lib/db";
import { githubClient } from "@/lib/github";
import { apiError, HttpError, requireApiSession } from "@/lib/http";

export async function GET(request: Request) {
  try {
    requireApiSession(request);
    const connectionId = new URL(request.url).searchParams.get("connectionId");
    if (!connectionId) throw new HttpError(400, "connectionId is required");
    const connection = getConnection(connectionId);
    if (!connection) throw new HttpError(404, "Connection not found");
    const repositories = await githubClient(connection.token).listRepositories(connection);
    return NextResponse.json({ repositories });
  } catch (error) {
    return apiError(error);
  }
}
