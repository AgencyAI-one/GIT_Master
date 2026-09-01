import { describe, expect, it, vi } from "vitest";
import { GitHubClient } from "@/lib/github";
import type { Connection } from "@/lib/types";

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

const connection: Connection = {
  id: "c1", name: "Repo", scopeType: "repository", owner: "acme", repository: "web", login: "dev", createdAt: "2026-08-31T00:00:00Z",
};

describe("GitHub adapter", () => {
  it("maps a repository-scoped connection", async () => {
    const fetcher = vi.fn(async () => jsonResponse({
      id: 1, node_id: "R_1", name: "web", full_name: "acme/web", private: true, archived: false,
      default_branch: "main", html_url: "https://github.com/acme/web", owner: { login: "acme" }, permissions: { push: true },
    }));
    const client = new GitHubClient("token", fetcher as unknown as typeof fetch, "https://api.github.test");
    const result = await client.listRepositories(connection);
    expect(result).toEqual([expect.objectContaining({ fullName: "acme/web", private: true, defaultBranch: "main" })]);
    expect(fetcher).toHaveBeenCalledWith("https://api.github.test/repos/acme/web", expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer token" }) }));
  });

  it("filters pull requests and derives repository-board statuses", async () => {
    const fetcher = vi.fn(async () => jsonResponse([
      { id: 1, node_id: "I_1", number: 7, title: "Build voice UX", body: "", state: "open", html_url: "https://github.test/7", labels: [{ name: "status: in progress", color: "00ff00" }], user: null, assignees: [], comments: 2, updated_at: "2026-08-31T00:00:00Z" },
      { id: 2, node_id: "PR_1", number: 8, title: "PR", state: "open", pull_request: {}, labels: [], assignees: [] },
      { id: 3, node_id: "I_2", number: 9, title: "Done", body: "", state: "closed", html_url: "https://github.test/9", labels: [], user: null, assignees: [], comments: 0, updated_at: "2026-08-31T00:00:00Z" },
      { id: 4, node_id: "I_3", number: 10, title: "Closed but reviewing", body: "", state: "closed", html_url: "https://github.test/10", labels: [{ name: "status: review", color: "aa00ff" }], user: null, assignees: [], comments: 0, updated_at: "2026-08-31T00:00:00Z" },
    ]));
    const client = new GitHubClient("token", fetcher as unknown as typeof fetch, "https://api.github.test");
    const board = await client.getRepositoryBoard("acme/web");
    expect(board.issues).toHaveLength(3);
    expect(board.issues[0].status).toBe("In progress");
    expect(board.issues[1].status).toBe("Done");
    expect(board.issues[2].status).toBe("Review");
  });

  it("surfaces GitHub API errors", async () => {
    const client = new GitHubClient("bad", (async () => jsonResponse({ message: "Bad credentials" }, 401)) as typeof fetch, "https://api.github.test");
    await expect(client.getViewer()).rejects.toMatchObject({ status: 401, message: "Bad credentials" });
  });

  it("deletes an issue through the GraphQL node id", async () => {
    const fetcher = vi.fn<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>(async () => jsonResponse({ data: { deleteIssue: { repository: { id: "R_1" } } } }));
    const client = new GitHubClient("token", fetcher as unknown as typeof fetch, "https://api.github.test");

    await client.deleteIssue("I_7");

    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.github.test/graphql");
    expect(init).toEqual(expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(String(init?.body))).toEqual(expect.objectContaining({ variables: { issue: "I_7" } }));
  });

  it("updates a ProjectV2 item position relative to the previous item", async () => {
    const fetcher = vi.fn<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>(async () => jsonResponse({
      data: { updateProjectV2ItemPosition: { items: { totalCount: 3 } } },
    }));
    const client = new GitHubClient("token", fetcher as unknown as typeof fetch, "https://api.github.test");

    await client.updateProjectPosition({ projectId: "PVT_1", itemId: "ITEM_3", afterId: "ITEM_1" });

    const [, init] = fetcher.mock.calls[0];
    const request = JSON.parse(String(init?.body)) as { query: string; variables: Record<string, unknown> };
    expect(request.query).toContain("updateProjectV2ItemPosition");
    expect(request.variables).toEqual({ project: "PVT_1", item: "ITEM_3", after: "ITEM_1" });
  });

  it("moves a ProjectV2 item to the top with a null afterId", async () => {
    const fetcher = vi.fn<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>(async () => jsonResponse({ data: { updateProjectV2ItemPosition: { items: { totalCount: 2 } } } }));
    const client = new GitHubClient("token", fetcher as unknown as typeof fetch, "https://api.github.test");

    await client.updateProjectPosition({ projectId: "PVT_1", itemId: "ITEM_2", afterId: null });

    const request = JSON.parse(String(fetcher.mock.calls[0][1]?.body)) as { variables: Record<string, unknown> };
    expect(request.variables.after).toBeNull();
  });

  it("updates and maps an issue comment", async () => {
    const fetcher = vi.fn(async () => jsonResponse({
      id: 91,
      body: "Updated text",
      created_at: "2026-08-31T10:00:00Z",
      updated_at: "2026-09-01T10:00:00Z",
      html_url: "https://github.test/comment/91",
      user: { login: "dev", avatar_url: "https://github.test/dev.png" },
    }));
    const client = new GitHubClient("token", fetcher as unknown as typeof fetch, "https://api.github.test");

    const comment = await client.updateComment("acme/web", 91, "Updated text");

    expect(comment).toEqual(expect.objectContaining({ id: 91, body: "Updated text", author: { login: "dev", avatarUrl: "https://github.test/dev.png" } }));
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.github.test/repos/acme/web/issues/comments/91",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ body: "Updated text" }) }),
    );
  });

  it("keeps closed Review items separate from Done in a Projects v2 board", async () => {
    const fetcher = vi.fn(async () => jsonResponse({
      data: {
        node: {
          id: "PVT_1",
          fields: {
            // GitHub returns empty objects for nodes excluded by inline fragments.
            nodes: [
              {},
              { id: "STATUS_FIELD", name: "Status", options: [
                { id: "REVIEW", name: "Review", color: "PURPLE" },
                { id: "DONE", name: "Done", color: "GREEN" },
              ] },
              {},
            ],
          },
          items: {
            nodes: [
              {
                id: "DRAFT_ITEM",
                fieldValues: { nodes: [{ name: "Review", optionId: "REVIEW", field: { id: "STATUS_FIELD", name: "Status" } }] },
                content: {},
              },
              {
                id: "ITEM_REVIEW",
                fieldValues: { nodes: [{ name: "Review", optionId: "REVIEW", field: { id: "STATUS_FIELD", name: "Status" } }] },
                content: {
                  id: "ISSUE_10", number: 10, title: "Awaiting QA", body: "", state: "CLOSED",
                  url: "https://github.test/10", updatedAt: "2026-09-01T00:00:00Z",
                  repository: { nameWithOwner: "acme/web" }, author: null,
                  labels: { nodes: [] }, assignees: { nodes: [] }, comments: { totalCount: 0 },
                },
              },
              {
                id: "ITEM_DONE",
                fieldValues: { nodes: [{ name: "Done", optionId: "DONE", field: { id: "STATUS_FIELD", name: "Status" } }] },
                content: {
                  id: "ISSUE_11", number: 11, title: "Released", body: "", state: "CLOSED",
                  url: "https://github.test/11", updatedAt: "2026-09-01T00:00:00Z",
                  repository: { nameWithOwner: "acme/web" }, author: null,
                  labels: { nodes: [] }, assignees: { nodes: [] }, comments: { totalCount: 0 },
                },
              },
            ],
          },
        },
      },
    }));
    const client = new GitHubClient("token", fetcher as unknown as typeof fetch, "https://api.github.test");
    const board = await client.getProjectBoard("PVT_1", "acme/web");

    expect(board.source).toBe("project");
    expect(board.statuses.map((status) => status.name)).toEqual(["Review", "Done"]);
    expect(board.issues.map((issue) => [issue.number, issue.status])).toEqual([
      [10, "Review"],
      [11, "Done"],
    ]);
  });
});
