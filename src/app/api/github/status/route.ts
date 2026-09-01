import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthorizedConnection } from "@/lib/connections";
import { githubClient } from "@/lib/github";
import { apiError, requireApiSession } from "@/lib/http";

const statusSchema = z.object({
  connectionId: z.string().min(1),
  repository: z.string().regex(/^[^/]+\/[^/]+$/),
  issueNumber: z.number().int().positive(),
  status: z.string().trim().min(1).max(100),
  labels: z.array(z.string()).default([]),
  state: z.enum(["open", "closed"]).default("open"),
  projectId: z.string().optional(),
  itemId: z.string().optional(),
  fieldId: z.string().optional(),
  optionId: z.string().optional(),
  afterItemId: z.string().nullable().optional(),
});

export async function PATCH(request: Request) {
  try {
    requireApiSession(request);
    const input = statusSchema.parse(await request.json());
    const connection = getAuthorizedConnection(input.connectionId, input.repository);
    const client = githubClient(connection.token);
    if (input.projectId && input.itemId && (input.afterItemId !== undefined || (input.fieldId && input.optionId))) {
      if (input.fieldId && input.optionId) {
        await client.updateProjectStatus({
          projectId: input.projectId,
          itemId: input.itemId,
          fieldId: input.fieldId,
          optionId: input.optionId,
        });
      }
      if (input.afterItemId !== undefined) {
        await client.updateProjectPosition({
          projectId: input.projectId,
          itemId: input.itemId,
          afterId: input.afterItemId,
        });
      }
    } else {
      await client.updateRepositoryStatus(input.repository, input.issueNumber, input.status, input.labels, input.state);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
