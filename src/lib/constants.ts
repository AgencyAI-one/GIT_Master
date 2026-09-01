import type { StatusOption } from "./types";

export const FALLBACK_STATUSES: StatusOption[] = [
  { id: "backlog", name: "Backlog" },
  { id: "todo", name: "Todo" },
  { id: "in-progress", name: "In progress" },
  { id: "review", name: "Review" },
  { id: "done", name: "Done" },
];
