import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

describe("secret encryption", () => {
  const key = createHash("sha256").update("unit-test-key").digest();

  it("round-trips a GitHub token without storing plaintext", () => {
    const token = "github_pat_sensitive-token-value";
    const encrypted = encryptSecret(token, key);
    expect(encrypted).toMatch(/^v1\./);
    expect(encrypted).not.toContain(token);
    expect(decryptSecret(encrypted, key)).toBe(token);
  });

  it("rejects tampered ciphertext", () => {
    const parts = encryptSecret("secret", key).split(".");
    parts[3] = `${parts[3][0] === "A" ? "B" : "A"}${parts[3].slice(1)}`;
    expect(() => decryptSecret(parts.join("."), key)).toThrow();
  });

  it("rejects keys of the wrong size", () => {
    expect(() => encryptSecret("secret", Buffer.alloc(12))).toThrow("32 bytes");
  });
});
