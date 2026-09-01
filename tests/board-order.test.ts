import { describe, expect, it } from "vitest";
import {
  applyStoredBoardOrder,
  boardIssueKey,
  issueBeforeInStatus,
  parseStoredBoardOrder,
  reorderBoardIssues,
} from "@/lib/board-order";
import type { BoardIssue } from "@/lib/types";

function issue(number: number, status: string, itemId = `ITEM_${number}`): BoardIssue {
  return {
    id: `ISSUE_${number}`,
    nodeId: `ISSUE_${number}`,
    itemId,
    number,
    title: `Issue ${number}`,
    body: "",
    state: "open",
    status,
    statusOptionId: status.toUpperCase(),
    url: `https://github.test/${number}`,
    repository: "acme/web",
    labels: [],
    assignees: [],
    commentCount: 0,
    updatedAt: "2026-09-01T00:00:00Z",
  };
}

describe("board ordering", () => {
  it("moves an issue before another issue in the same column", () => {
    const first = issue(1, "Todo");
    const second = issue(2, "Todo");
    const third = issue(3, "Todo");

    const ordered = reorderBoardIssues([first, second, third], third, "Todo", first);

    expect(ordered.map((item) => item.number)).toEqual([3, 1, 2]);
    expect(issueBeforeInStatus(ordered, ordered[0])).toBeUndefined();
    expect(issueBeforeInStatus(ordered, ordered[1])).toMatchObject({ number: 3 });
  });

  it("moves an issue to the end of its column", () => {
    const first = issue(1, "Todo");
    const second = issue(2, "Todo");
    const third = issue(3, "Todo");

    expect(reorderBoardIssues([first, second, third], first, "Todo").map((item) => item.number)).toEqual([2, 3, 1]);
  });

  it("changes status and inserts before the selected destination issue", () => {
    const todo = issue(1, "Todo");
    const reviewFirst = issue(2, "Review");
    const reviewSecond = issue(3, "Review");

    const ordered = reorderBoardIssues([todo, reviewFirst, reviewSecond], todo, "Review", reviewSecond);

    expect(ordered.map((item) => [item.number, item.status])).toEqual([
      [2, "Review"],
      [1, "Review"],
      [3, "Review"],
    ]);
    expect(issueBeforeInStatus(ordered, ordered[1])).toMatchObject({ itemId: "ITEM_2" });
  });

  it("restores a saved browser order and safely parses storage", () => {
    const issues = [issue(1, "Todo", ""), issue(2, "Todo", ""), issue(3, "Todo", "")];
    const keys = [boardIssueKey(issues[2]), boardIssueKey(issues[0])];

    expect(applyStoredBoardOrder(issues, keys).map((item) => item.number)).toEqual([3, 1, 2]);
    expect(parseStoredBoardOrder(JSON.stringify(keys))).toEqual(keys);
    expect(parseStoredBoardOrder("invalid")).toEqual([]);
  });
});
