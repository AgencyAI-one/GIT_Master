"use client";

import { useState } from "react";
import { CalendarClock, CircleDot, GripVertical, MessageSquare, Paperclip, Plus, UserRound } from "lucide-react";
import type { Board, BoardIssue, StatusOption } from "@/lib/types";
import { cn } from "@/lib/cn";

const statusColorMap: Record<string, string> = {
  gray: "#8b949e", grey: "#8b949e", blue: "#5295e6", green: "#63a75f", yellow: "#d9ad3a",
  orange: "#d48339", red: "#d65a5a", pink: "#d66ba0", purple: "#986ad6",
};

function statusColor(status: StatusOption, index: number) {
  if (status.color) return statusColorMap[status.color.toLowerCase()] || (status.color.startsWith("#") ? status.color : undefined) || "#8b949e";
  return ["#8b949e", "#7097d7", "#d29b36", "#986ad6", "#63a75f"][index % 5];
}

function relativeTime(date: string) {
  const delta = Date.now() - new Date(date).getTime();
  if (!Number.isFinite(delta)) return "";
  const minutes = Math.max(1, Math.round(delta / 60_000));
  if (minutes < 60) return `${minutes}хв`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}год`;
  const days = Math.round(hours / 24);
  return `${days}д`;
}

function labelTextColor(hex: string) {
  const value = hex.replace("#", "").padEnd(6, "0");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#2c302c" : "#fff";
}

function IssueCard({ issue, onOpen, onDrag }: { issue: BoardIssue; onOpen: () => void; onDrag: (issue: BoardIssue) => void }) {
  return (
    <button
      type="button"
      draggable
      onDragStart={(event) => {
        onDrag(issue);
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(issue.number));
      }}
      onClick={onOpen}
      className="focus-ring group block w-full rounded-xl border border-[#e1e4de] bg-white p-3.5 text-left shadow-[0_1px_1px_rgba(16,19,21,.03)] transition hover:-translate-y-0.5 hover:border-[#c9cdc6] hover:shadow-[0_8px_24px_rgba(16,19,21,.08)]"
    >
      <div className="mb-2.5 flex items-center justify-between gap-3 text-[11px] text-[#8b9189]">
        <span className="flex min-w-0 items-center gap-1.5"><CircleDot size={12} className="text-[#779f34]" /><span className="truncate">{issue.repository.split("/")[1]}</span><span>#{issue.number}</span></span>
        <GripVertical size={14} className="opacity-0 transition group-hover:opacity-45" />
      </div>
      <h3 className="line-clamp-3 text-[13px] font-semibold leading-[1.42] tracking-[-.01em] text-[#25292b]">{issue.title}</h3>
      {issue.labels.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {issue.labels.slice(0, 3).map((label) => (
            <span key={label.name} className="max-w-[120px] truncate rounded-full px-2 py-0.5 text-[9px] font-semibold" style={{ backgroundColor: `#${label.color.replace("#", "")}`, color: labelTextColor(label.color) }}>{label.name}</span>
          ))}
          {issue.labels.length > 3 && <span className="px-1 text-[10px] text-[#8b9189]">+{issue.labels.length - 3}</span>}
        </div>
      )}
      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] text-[#969b94]">
          {issue.commentCount > 0 && <span className="flex items-center gap-1"><MessageSquare size={11} />{issue.commentCount}</span>}
          {/!\[[^\]]*\]\(|\[[^\]]+\]\(http/.test(issue.body) && <Paperclip size={11} />}
          <span className="flex items-center gap-1"><CalendarClock size={11} />{relativeTime(issue.updatedAt)}</span>
        </div>
        <div className="flex -space-x-1.5">
          {issue.assignees.slice(0, 3).map((assignee) => <img key={assignee.login} src={assignee.avatarUrl} title={assignee.login} alt={assignee.login} className="h-5 w-5 rounded-full border-2 border-white bg-[#e8eae5]" />)}
          {!issue.assignees.length && <span title="Без виконавця" className="grid h-5 w-5 place-items-center rounded-full bg-[#eff1ec] text-[#9ba098]"><UserRound size={10} /></span>}
        </div>
      </div>
    </button>
  );
}

export function Kanban(props: {
  board: Board;
  onOpen: (issue: BoardIssue) => void;
  onCreate: (status: StatusOption) => void;
  onMove: (issue: BoardIssue, status: StatusOption) => Promise<void> | void;
  moving?: string;
}) {
  const [dragged, setDragged] = useState<BoardIssue | null>(null);
  const [overStatus, setOverStatus] = useState<string | null>(null);

  return (
    <div className="flex h-full min-h-0 gap-3 overflow-x-auto px-4 pb-5 pt-2 sm:px-6 lg:px-8">
      {props.board.statuses.map((status, index) => {
        const issues = props.board.issues.filter((issue) => issue.status.toLowerCase() === status.name.toLowerCase());
        const color = statusColor(status, index);
        return (
          <section
            key={status.id}
            aria-label={`${status.name} column`}
            onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setOverStatus(status.id); }}
            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOverStatus(null); }}
            onDrop={async (event) => {
              event.preventDefault();
              setOverStatus(null);
              const issueNumber = Number(event.dataTransfer.getData("text/plain"));
              const movingIssue = dragged || props.board.issues.find((issue) => issue.number === issueNumber) || null;
              if (movingIssue && movingIssue.status.toLowerCase() !== status.name.toLowerCase()) await props.onMove(movingIssue, status);
              setDragged(null);
            }}
            className={cn("flex h-full min-h-[440px] w-[286px] shrink-0 flex-col rounded-xl px-1.5 transition sm:w-[300px]", overStatus === status.id && "bg-[#b9ec55]/14")}
          >
            <header className="flex h-12 items-center gap-2 px-2">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
              <h2 className="text-xs font-semibold">{status.name}</h2>
              <span className="text-[11px] tabular-nums text-[#92978f]">{issues.length}</span>
              <button type="button" onClick={() => props.onCreate(status)} aria-label={`Додати в ${status.name}`} className="focus-ring ml-auto grid h-7 w-7 place-items-center rounded-full text-[#8d938b] transition hover:bg-[#e4e7e0] hover:text-[#202426]"><Plus size={15} /></button>
            </header>
            <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-0.5 pb-4">
              {issues.map((issue) => <IssueCard key={issue.itemId || issue.id} issue={issue} onOpen={() => props.onOpen(issue)} onDrag={setDragged} />)}
              {!issues.length && (
                <button type="button" onClick={() => props.onCreate(status)} className="focus-ring flex min-h-24 items-center justify-center rounded-xl border border-dashed border-[#d8dbd5] text-[11px] font-medium text-[#a0a59e] transition hover:border-[#b9c0b5] hover:text-[#6e746d]">
                  <Plus size={13} className="mr-1.5" /> Додати issue
                </button>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
