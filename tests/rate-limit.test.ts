import { beforeEach, describe, expect, it } from "vitest";
import { clearLoginAttempts, consumeLoginAttempt, resetRateLimitsForTests } from "@/lib/rate-limit";

describe("login rate limiter", () => {
  beforeEach(resetRateLimitsForTests);

  it("blocks repeated attempts and reports retry time", () => {
    for (let index = 0; index < 8; index += 1) expect(consumeLoginAttempt("ip", 1000).allowed).toBe(true);
    expect(consumeLoginAttempt("ip", 1000)).toEqual({ allowed: false, retryAfter: 900 });
  });

  it("can be cleared after a successful login", () => {
    consumeLoginAttempt("ip", 1000);
    clearLoginAttempts("ip");
    expect(consumeLoginAttempt("ip", 1000).allowed).toBe(true);
  });
});
