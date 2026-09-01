import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthorizedConnection } from "@/lib/connections";
import { githubClient } from "@/lib/github";
import { apiError, HttpError, requireApiSession } from "@/lib/http";

const updateSchema = z.object({
  connectionId: z.string().min(1),
  repository: z.string().regex(/^[^/]+\/[^/]+$/),
  title: z.string().trim().min(1).max(256).optional(),
  body: z.string().max(250_000).optional(),
  labels: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  state: z.enum(["open", "closed"]).optional(),
});

const deleteSchema = z.object({
  connectionId: z.string().min(1),
  repository: z.string().regex(/^[^/]+\/[^/]+$/),
});

function issueNumber(value: string) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new HttpError(400, "Invalid issue number");
  return parsed;
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
    const issue = await githubClient(connection.token).getIssue(repository, issueNumber(number));
    return NextResponse.json({ issue });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ number: string }> }) {
  try {
    requireApiSession(request);
    const input = updateSchema.parse(await request.json());
    const connection = getAuthorizedConnection(input.connectionId, input.repository);
    const { number } = await params;
    const parsedNumber = issueNumber(number);
    await githubClient(connection.token).updateIssue(input.repository, parsedNumber, {
      title: input.title,
      body: input.body,
      labels: input.labels,
      state: input.state,
    });
    const issue = await githubClient(connection.token).getIssue(input.repository, parsedNumber);
    return NextResponse.json({ issue });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ number: string }> }) {
  try {
    requireApiSession(request);
    const input = deleteSchema.parse(await request.json());
    const connection = getAuthorizedConnection(input.connectionId, input.repository);
    const { number } = await params;
    const parsedNumber = issueNumber(number);
    const client = githubClient(connection.token);
    const issue = await client.getIssue(input.repository, parsedNumber);
    await client.deleteIssue(issue.nodeId);
    return NextResponse.json({ deleted: true, number: parsedNumber });
  } catch (error) {
    return apiError(error);
  }
}
