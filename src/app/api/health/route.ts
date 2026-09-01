import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";

export async function GET() {
  try {
    const config = getConfig();
    return NextResponse.json({
      status: config.usingUnsafeDefaults ? "degraded" : "ok",
      voice: Boolean(config.openaiApiKey),
      unsafeDefaults: config.usingUnsafeDefaults,
      version: process.env.npm_package_version || "0.1.0",
    });
  } catch (error) {
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : "Invalid configuration" },
      { status: 503 },
    );
  }
}
