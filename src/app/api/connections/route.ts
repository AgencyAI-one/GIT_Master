import { NextResponse } from "next/server";
import { z } from "zod";
import { createConnection, listConnections } from "@/lib/db";
import { githubClient } from "@/lib/github";
import { apiError, requireApiSession } from "@/lib/http";

const connectionSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    token: z.string().trim().min(20).max(512),
    scopeType: z.enum(["account", "organization", "repository"]),
    owner: z.string().trim().min(1).max(100).optional(),
    repository: z.string().trim().min(1).max(100).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.scopeType !== "account" && !value.owner) {
      ctx.addIssue({ code: "custom", path: ["owner"], message: "Owner is required for this scope" });
    }
    if (value.scopeType === "repository" && !value.repository) {
      ctx.addIssue({ code: "custom", path: ["repository"], message: "Repository is required" });
    }
  });

export async function GET(request: Request) {
  try {
    requireApiSession(request);
    return NextResponse.json({ connections: listConnections() });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    requireApiSession(request);
    const input = connectionSchema.parse(await request.json());
    const client = githubClient(input.token);
    const viewer = await client.getViewer();
    await client.verifyScope(input.scopeType, input.owner, input.repository);
    const connection = createConnection({
      ...input,
      name: input.name || (input.scopeType === "repository" ? `${input.owner}/${input.repository}` : input.owner || viewer.login),
      login: viewer.login,
      avatarUrl: viewer.avatar_url,
    });
    return NextResponse.json({ connection }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
