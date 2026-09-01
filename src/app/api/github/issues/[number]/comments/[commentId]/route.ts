import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthorizedConnection } from "@/lib/connections";
import { githubClient } from "@/lib/github";
import { apiError, HttpError, requireApiSession } from "@/lib/http";

const updateCommentSchema = z.object({
  connectionId: z.string().min(1),
  repository: z.string().regex(/^[^/]+\/[^/]+$/),
  body: z.string().trim().min(1).max(250_000),
});

function positiveInteger(value: string, label: string) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new HttpError(400, `Invalid ${label}`);
  return parsed;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ number: string; commentId: string }> }) {
  try {
    requireApiSession(request);
    const input = updateCommentSchema.parse(await request.json());
    const connection = getAuthorizedConnection(input.connectionId, input.repository);
    const { number, commentId } = await params;
    positiveInteger(number, "issue number");
    const comment = await githubClient(connection.token).updateComment(
      input.repository,
      positiveInteger(commentId, "comment id"),
      input.body,
    );
    return NextResponse.json({ comment });
  } catch (error) {
    return apiError(error);
  }
}
