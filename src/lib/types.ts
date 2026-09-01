export type ConnectionScope = "account" | "organization" | "repository";

export type Connection = {
  id: string;
  name: string;
  scopeType: ConnectionScope;
  owner?: string;
  repository?: string;
  login: string;
  avatarUrl?: string;
  createdAt: string;
};

export type Repository = {
  id: number;
  nodeId: string;
  name: string;
  fullName: string;
  owner: string;
  private: boolean;
  archived: boolean;
  defaultBranch: string;
  url: string;
  permissions?: { push?: boolean; pull?: boolean; admin?: boolean };
};

export type Project = {
  id: string;
  number: number;
  title: string;
  url: string;
  closed: boolean;
};

export type StatusOption = {
  id: string;
  name: string;
  color?: string;
};

export type BoardIssue = {
  id: string;
  nodeId: string;
  itemId?: string;
  number: number;
  title: string;
  body: string;
  state: "open" | "closed";
  status: string;
  statusOptionId?: string;
  url: string;
  repository: string;
  labels: Array<{ name: string; color: string }>;
  author?: { login: string; avatarUrl: string };
  assignees: Array<{ login: string; avatarUrl: string }>;
  commentCount: number;
  updatedAt: string;
};

export type Board = {
  source: "project" | "repository" | "demo";
  projectId?: string;
  statusFieldId?: string;
  statuses: StatusOption[];
  issues: BoardIssue[];
};

export type IssueComment = {
  id: number;
  body: string;
  createdAt: string;
  updatedAt: string;
  url: string;
  author: { login: string; avatarUrl: string };
};

export type VoiceCommand =
  | { action: "open_create" }
  | { action: "open_issue"; issueNumber: number }
  | { action: "delete_issue"; issueNumber?: number }
  | { action: "move_issue"; issueNumber?: number; sourceStatus?: string; targetStatus: string }
  | { action: "set_title"; value: string }
  | { action: "append_body"; value: string }
  | { action: "append_comment"; value: string }
  | { action: "submit_issue" }
  | { action: "search"; value: string }
  | { action: "refresh" }
  | { action: "close_panel" }
  | { action: "unknown"; value?: string };
