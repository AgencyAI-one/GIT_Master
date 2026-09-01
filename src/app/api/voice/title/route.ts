import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireApiSession } from "@/lib/http";
import { generateIssueTitle } from "@/lib/voice";

const schema = z.object({
  body: z.string().trim().min(3).max(250_000),
  repository: z.string().max(220).optional(),
});

export async function POST(request: Request) {
  try {
    requireApiSession(request);
    const input = schema.parse(await request.json());
    return NextResponse.json({ title: await generateIssueTitle(input.body, input.repository) });
  } catch (error) {
    return apiError(error);
  }
}
