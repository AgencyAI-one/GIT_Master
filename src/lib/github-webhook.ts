import { createHmac, timingSafeEqual } from "node:crypto";
import type { BoardChangedEvent } from "./live-events";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : undefined;
}

function string(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function verifyGitHubWebhookSignature(body: string, signature: string | null, secret: string) {
  if (!signature?.startsWith("sha256=") || !secret) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(signature);
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}

export function boardEventFromGitHubWebhook(input: {
  githubEvent: string;
  deliveryId: string;
  payload: unknown;
  now?: Date;
}): BoardChangedEvent | undefined {
  const payload = record(input.payload);
  if (!payload) return;
  const action = string(payload.action) || "unknown";
  const repository = string(record(payload.repository)?.full_name);
  const organization = string(record(payload.organization)?.login);

  if (["issues", "issue_comment"].includes(input.githubEvent) && repository) {
    return {
      type: "board_changed",
      deliveryId: input.deliveryId,
      githubEvent: input.githubEvent,
      action,
      repository,
      at: (input.now || new Date()).toISOString(),
    };
  }

  if (input.githubEvent === "projects_v2_item") {
    const projectId = string(record(payload.projects_v2_item)?.project_node_id);
    if (!projectId && !organization) return;
    return {
      type: "board_changed",
      deliveryId: input.deliveryId,
      githubEvent: input.githubEvent,
      action,
      projectId,
      owner: organization,
      at: (input.now || new Date()).toISOString(),
    };
  }

  if (input.githubEvent === "projects_v2") {
    const projectId = string(record(payload.projects_v2)?.node_id);
    if (!projectId && !organization) return;
    return {
      type: "board_changed",
      deliveryId: input.deliveryId,
      githubEvent: input.githubEvent,
      action,
      projectId,
      owner: organization,
      at: (input.now || new Date()).toISOString(),
    };
  }
}
