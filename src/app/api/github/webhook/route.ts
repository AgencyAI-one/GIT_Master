import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { boardEventFromGitHubWebhook, verifyGitHubWebhookSignature } from "@/lib/github-webhook";
import { publishBoardChanged } from "@/lib/live-events";

export const runtime = "nodejs";

const MAX_WEBHOOK_BYTES = 2 * 1024 * 1024;

export async function POST(request: Request) {
  const secret = getConfig().githubWebhookSecret;
  if (!secret) return NextResponse.json({ error: "GitHub webhooks are not configured" }, { status: 503 });

  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_WEBHOOK_BYTES) return NextResponse.json({ error: "Webhook payload is too large" }, { status: 413 });

  const body = await request.text();
  if (Buffer.byteLength(body, "utf8") > MAX_WEBHOOK_BYTES) return NextResponse.json({ error: "Webhook payload is too large" }, { status: 413 });
  if (!verifyGitHubWebhookSignature(body, request.headers.get("x-hub-signature-256"), secret)) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid webhook JSON" }, { status: 400 });
  }

  const githubEvent = request.headers.get("x-github-event") || "unknown";
  if (githubEvent === "ping") return NextResponse.json({ ok: true, event: "ping" });
  const event = boardEventFromGitHubWebhook({
    githubEvent,
    deliveryId: request.headers.get("x-github-delivery") || randomUUID(),
    payload,
  });
  if (!event) return NextResponse.json({ ok: true, ignored: true });
  const published = publishBoardChanged(event);
  return NextResponse.json({ ok: true, published });
}
