import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionValue, passwordsMatch, verifySessionValue } from "@/lib/auth";

describe("environment password session", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("APP_PASSWORD", "correct horse battery staple");
    vi.stubEnv("APP_SECRET", "a-session-secret-with-at-least-thirty-two-characters");
    vi.stubEnv("ENCRYPTION_KEY", "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef");
  });

  it("accepts only the configured password", () => {
    expect(passwordsMatch("correct horse battery staple")).toBe(true);
    expect(passwordsMatch("incorrect")).toBe(false);
  });

  it("creates a signed, expiring session", () => {
    const now = Date.UTC(2026, 7, 31);
    const session = createSessionValue(now);
    expect(verifySessionValue(session, now + 1_000)).toBe(true);
    expect(verifySessionValue(session, now + 15 * 24 * 60 * 60 * 1000)).toBe(false);
  });

  it("rejects a modified session", () => {
    const session = createSessionValue();
    const [payload, signature] = session.split(".");
    expect(verifySessionValue(`${payload}x.${signature}`)).toBe(false);
  });
});
