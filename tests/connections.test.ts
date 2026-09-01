import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getConnection: (id: string) => id === "repo" ? {
    id: "repo", name: "Scoped", scopeType: "repository", owner: "AgencyAI-one", repository: "GIT_Master",
    login: "dev", createdAt: "2026-08-31T00:00:00Z", token: "secret",
  } : id === "org" ? {
    id: "org", name: "Org", scopeType: "organization", owner: "AgencyAI-one",
    login: "dev", createdAt: "2026-08-31T00:00:00Z", token: "secret",
  } : undefined,
}));

import { getAuthorizedConnection } from "@/lib/connections";

describe("connection repository boundary", () => {
  it("allows the configured repository case-insensitively", () => {
    expect(getAuthorizedConnection("repo", "agencyai-ONE/git_master").id).toBe("repo");
  });

  it("blocks a different repository even when the token could access it", () => {
    expect(() => getAuthorizedConnection("repo", "AgencyAI-one/private-secrets")).toThrow(
      "outside this repository connection",
    );
  });

  it("limits organization connections to the configured owner", () => {
    expect(getAuthorizedConnection("org", "AgencyAI-one/web").id).toBe("org");
    expect(() => getAuthorizedConnection("org", "another-org/web")).toThrow(
      "outside this organization connection",
    );
  });
});
