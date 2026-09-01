import { NextResponse } from "next/server";
import { getAuthorizedConnection } from "@/lib/connections";
import { githubClient } from "@/lib/github";
import { apiError, HttpError, requireApiSession } from "@/lib/http";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    requireApiSession(request);
    const data = await request.formData();
    const connectionId = String(data.get("connectionId") || "");
    const repository = String(data.get("repository") || "");
    const issueNumber = Number(data.get("issueNumber"));
    const file = data.get("file");
    if (!connectionId || !/^[^/]+\/[^/]+$/.test(repository) || !Number.isSafeInteger(issueNumber) || issueNumber < 1) {
      throw new HttpError(400, "connectionId, repository and issueNumber are required");
    }
    if (!(file instanceof File)) throw new HttpError(400, "file is required");
    if (file.size > MAX_UPLOAD_BYTES) throw new HttpError(413, "Files are limited to 10 MB");
    const connection = getAuthorizedConnection(connectionId, repository);
    const attachment = await githubClient(connection.token).uploadAttachment({
      repository,
      issueNumber,
      filename: file.name,
      contentType: file.type || "application/octet-stream",
      content: Buffer.from(await file.arrayBuffer()),
    });
    return NextResponse.json({ attachment }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
