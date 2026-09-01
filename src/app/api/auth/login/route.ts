import { NextResponse } from "next/server";
import { z } from "zod";
import { createSessionValue, passwordsMatch, SESSION_COOKIE } from "@/lib/auth";
import { apiError, HttpError } from "@/lib/http";
import { clearLoginAttempts, consumeLoginAttempt } from "@/lib/rate-limit";

const schema = z.object({ password: z.string().min(1).max(256) });

export async function POST(request: Request) {
  try {
    const { password } = schema.parse(await request.json());
    const key = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    const limit = consumeLoginAttempt(key);
    if (!limit.allowed) {
      const response = NextResponse.json({ error: "Too many login attempts. Try again later." }, { status: 429 });
      response.headers.set("Retry-After", String(limit.retryAfter));
      return response;
    }
    if (!passwordsMatch(password)) throw new HttpError(401, "Incorrect password");
    clearLoginAttempts(key);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, createSessionValue(), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 14,
    });
    return response;
  } catch (error) {
    return apiError(error);
  }
}
