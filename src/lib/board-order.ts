import type { BoardIssue } from "./types";

function normalizedStatus(value: string) {
  return value.trim().toLocaleLowerCase("uk-UA");
}

export function boardIssueKey(issue: BoardIssue) {
  return issue.itemId || `${issue.repository}#${issue.number}`;
}

export function reorderBoardIssues(
  issues: BoardIssue[],
  movingIssue: BoardIssue,
  targetStatus: string,
  beforeIssue?: BoardIssue,
) {
  const movingKey = boardIssueKey(movingIssue);
  const current = issues.find((issue) => boardIssueKey(issue) === movingKey);
  if (!current) return issues;

  const remaining = issues.filter((issue) => boardIssueKey(issue) !== movingKey);
  const moved = { ...current, status: targetStatus };
  const beforeKey = beforeIssue ? boardIssueKey(beforeIssue) : "";
  let insertionIndex = beforeKey
    ? remaining.findIndex((issue) => boardIssueKey(issue) === beforeKey && normalizedStatus(issue.status) === normalizedStatus(targetStatus))
    : -1;

  if (insertionIndex < 0) {
    const lastTargetIndex = remaining.findLastIndex((issue) => normalizedStatus(issue.status) === normalizedStatus(targetStatus));
    insertionIndex = lastTargetIndex >= 0 ? lastTargetIndex + 1 : remaining.length;
  }

  remaining.splice(insertionIndex, 0, moved);
  return remaining;
}

export function issueBeforeInStatus(issues: BoardIssue[], issue: BoardIssue) {
  const column = issues.filter((candidate) => normalizedStatus(candidate.status) === normalizedStatus(issue.status));
  const index = column.findIndex((candidate) => boardIssueKey(candidate) === boardIssueKey(issue));
  return index > 0 ? column[index - 1] : undefined;
}

export function applyStoredBoardOrder(issues: BoardIssue[], storedKeys: string[]) {
  const rank = new Map(storedKeys.map((key, index) => [key, index]));
  return issues
    .map((issue, sourceIndex) => ({ issue, sourceIndex, rank: rank.get(boardIssueKey(issue)) }))
    .sort((left, right) => {
      if (left.rank !== undefined && right.rank !== undefined) return left.rank - right.rank;
      if (left.rank !== undefined) return -1;
      if (right.rank !== undefined) return 1;
      return left.sourceIndex - right.sourceIndex;
    })
    .map(({ issue }) => issue);
}

export function parseStoredBoardOrder(value: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}
