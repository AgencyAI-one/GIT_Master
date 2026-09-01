import { describe, expect, it } from "vitest";
import { getConfig } from "@/lib/config";

describe("configuration", () => {
  it("requires secrets in production", () => {
    expect(() => getConfig({ NODE_ENV: "production" })).toThrow("APP_PASSWORD");
  });

  it("accepts a 64-character hexadecimal encryption key", () => {
    const config = getConfig({
      NODE_ENV: "production",
      APP_PASSWORD: "password",
      APP_SECRET: "this-is-a-secret-that-is-long-enough-for-production",
      ENCRYPTION_KEY: "a".repeat(64),
      GITHUB_WEBHOOK_SECRET: "webhook-secret",
    });
    expect(config.encryptionKey).toHaveLength(32);
    expect(config.usingUnsafeDefaults).toBe(false);
    expect(config.githubWebhookSecret).toBe("webhook-secret");
  });
});
