import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthorizedConnection } from "@/lib/connections";
import { githubClient } from "@/lib/github";
import { apiError, HttpError, requireApiSession } from "@/lib/http";

const commentSchema = z.object({
  connectionId: z.string().min(1),
  repository: z.string().regex(/^[^/]+\/[^/]+$/),
  body: z.string().trim().min(1).max(250_000),
});

function parseNumber(value: string) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw new HttpError(400, "Invalid issue number");
  return number;
}

export async function GET(request: Request, { params }: { params: Promise<{ number: string }> }) {
  try {
    requireApiSession(request);
    const query = new URL(request.url).searchParams;
    const connectionId = query.get("connectionId");
    const repository = query.get("repository");
    if (!connectionId || !repository) throw new HttpError(400, "connectionId and repository are required");
    const connection = getAuthorizedConnection(connectionId, repository);
    const { number } = await params;
    const comments = await githubClient(connection.token).listComments(repository, parseNumber(number));
    return NextResponse.json({ comments });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ number: string }> }) {
  try {
    requireApiSession(request);
    const input = commentSchema.parse(await request.json());
    const connection = getAuthorizedConnection(input.connectionId, input.repository);
    const { number } = await params;
    const issueNumber = parseNumber(number);
    const client = githubClient(connection.token);
    await client.createComment(input.repository, issueNumber, input.body);
    const comments = await client.listComments(input.repository, issueNumber);
    return NextResponse.json({ comments }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
