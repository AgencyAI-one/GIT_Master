import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthorizedConnection } from "@/lib/connections";
import { githubClient } from "@/lib/github";
import { apiError, requireApiSession } from "@/lib/http";

const createIssueSchema = z.object({
  connectionId: z.string().min(1),
  repository: z.string().regex(/^[^/]+\/[^/]+$/),
  projectId: z.string().optional(),
  statusFieldId: z.string().optional(),
  statusOptionId: z.string().optional(),
  status: z.string().trim().min(1).max(100).optional(),
  title: z.string().trim().min(1).max(256),
  body: z.string().max(250_000).default(""),
  labels: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
});

export async function POST(request: Request) {
  try {
    requireApiSession(request);
    const input = createIssueSchema.parse(await request.json());
    const connection = getAuthorizedConnection(input.connectionId, input.repository);
    const client = githubClient(connection.token);
    const rawIssue = await client.createIssue(input);
    const warnings: string[] = [];
    let itemId: string | undefined;
    if (input.projectId) {
      try {
        itemId = await client.addIssueToProject(input.projectId, rawIssue.node_id);
        if (input.statusFieldId && input.statusOptionId) {
          await client.updateProjectStatus({
            projectId: input.projectId,
            itemId,
            fieldId: input.statusFieldId,
            optionId: input.statusOptionId,
          });
        }
      } catch (error) {
        warnings.push(`Issue was created, but could not be added to the project: ${error instanceof Error ? error.message : "unknown error"}`);
      }
    } else if (input.status && input.status.toLowerCase() !== "todo") {
      try {
        await client.updateRepositoryStatus(input.repository, rawIssue.number, input.status, input.labels, "open");
      } catch (error) {
        warnings.push(`Issue was created, but its status could not be set: ${error instanceof Error ? error.message : "unknown error"}`);
      }
    }
    const issue = await client.getIssue(input.repository, rawIssue.number);
    return NextResponse.json({ issue: { ...issue, itemId }, warnings }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
