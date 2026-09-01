import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireApiSession } from "@/lib/http";
import { interpretVoiceCommand } from "@/lib/voice";

const schema = z.object({
  text: z.string().trim().min(1).max(4000),
  context: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request) {
  try {
    requireApiSession(request);
    const input = schema.parse(await request.json());
    const command = await interpretVoiceCommand(input.text, input.context);
    return NextResponse.json({ command });
  } catch (error) {
    return apiError(error);
  }
}
