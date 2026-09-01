import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { boardEventFromGitHubWebhook, verifyGitHubWebhookSignature } from "@/lib/github-webhook";

describe("GitHub webhook verification", () => {
  it("validates GitHub's documented SHA-256 test vector", () => {
    expect(verifyGitHubWebhookSignature(
      "Hello, World!",
      "sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17",
      "It's a Secret to Everybody",
    )).toBe(true);
  });

  it("rejects missing and altered signatures", () => {
    const body = JSON.stringify({ action: "edited" });
    const signature = `sha256=${createHmac("sha256", "secret").update(body).digest("hex")}`;
    expect(verifyGitHubWebhookSignature(body, signature, "secret")).toBe(true);
    expect(verifyGitHubWebhookSignature(`${body} `, signature, "secret")).toBe(false);
    expect(verifyGitHubWebhookSignature(body, null, "secret")).toBe(false);
  });
});

describe("GitHub webhook board events", () => {
  const now = new Date("2026-09-01T12:00:00.000Z");

  it("targets the exact ProjectV2 board for an edited item", () => {
    expect(boardEventFromGitHubWebhook({
      githubEvent: "projects_v2_item",
      deliveryId: "delivery-project",
      now,
      payload: {
        action: "edited",
        projects_v2_item: { node_id: "PVTI_1", project_node_id: "PVT_1" },
        changes: { field_value: { field_type: "single_select" } },
        organization: { login: "AgencyAI-one" },
      },
    })).toEqual({
      type: "board_changed",
      deliveryId: "delivery-project",
      githubEvent: "projects_v2_item",
      action: "edited",
      projectId: "PVT_1",
      owner: "AgencyAI-one",
      at: now.toISOString(),
    });
  });

  it("targets a repository board for issue activity", () => {
    expect(boardEventFromGitHubWebhook({
      githubEvent: "issues",
      deliveryId: "delivery-issue",
      now,
      payload: { action: "labeled", repository: { full_name: "AgencyAI-one/GIT_Master" } },
    })).toMatchObject({ repository: "AgencyAI-one/GIT_Master", action: "labeled" });
  });

  it("ignores events that cannot affect a board", () => {
    expect(boardEventFromGitHubWebhook({
      githubEvent: "push",
      deliveryId: "delivery-push",
      payload: {},
    })).toBeUndefined();
  });
});
