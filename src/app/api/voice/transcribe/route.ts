import { NextResponse } from "next/server";
import { apiError, HttpError, requireApiSession } from "@/lib/http";
import { transcribeAudio } from "@/lib/voice";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    requireApiSession(request);
    const data = await request.formData();
    const audio = data.get("audio");
    if (!(audio instanceof File)) throw new HttpError(400, "audio is required");
    if (audio.size > MAX_AUDIO_BYTES) throw new HttpError(413, "Audio is limited to 25 MB");
    const text = await transcribeAudio({
      file: audio,
      language: String(data.get("language") || "auto"),
      context: String(data.get("context") || ""),
    });
    return NextResponse.json({ text });
  } catch (error) {
    return apiError(error);
  }
}
