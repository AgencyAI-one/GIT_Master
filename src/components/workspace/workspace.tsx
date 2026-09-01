"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import {
  AudioLines, ChevronDown, CircleDot, Command, Github, KanbanSquare, LoaderCircle, LogOut,
  Menu, Plus, RefreshCw, Search, Settings2, SlidersHorizontal, X,
} from "lucide-react";
import type { Board, BoardIssue, Connection, Project, Repository, StatusOption, VoiceCommand } from "@/lib/types";
import { FALLBACK_STATUSES } from "@/lib/constants";
import { api, jsonInit } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import {
  DEFAULT_SHORTCUTS,
  formatShortcut,
  hasShortcutModifier,
  isEditableShortcutTarget,
  matchesShortcut,
  parseShortcutSettings,
  PushToTalkController,
  SHORTCUTS_STORAGE_KEY,
  type ShortcutSettings,
} from "@/lib/shortcuts";
import {
  DEFAULT_VOICE_COMMANDS,
  parseVoiceCommandSettings,
  VOICE_COMMANDS_STORAGE_KEY,
  type VoiceCommandSettings,
} from "@/lib/voice-command-settings";
import { ConnectDialog } from "./connect-dialog";
import { IssueDrawer, type EditorVoiceCommand } from "./issue-drawer";
import { Kanban } from "./kanban";
import { SettingsDialog } from "./settings-dialog";
import { Toasts, type ToastMessage } from "./toast";
import { VoiceCommandCenter, type VoiceCommandHandle } from "./voice-command";

const now = Date.now();
const demoIssues: BoardIssue[] = [
  {
    id: "demo-1", nodeId: "demo-1", number: 42, title: "Додати голосове створення issues українською", body: "Підтримати контекстне доповнення опису кількома голосовими фрагментами.", state: "open", status: "In progress", url: "#", repository: "git-master/app", labels: [{ name: "voice", color: "b9ec55" }, { name: "feature", color: "dbeafe" }], author: undefined, assignees: [], commentCount: 4, updatedAt: new Date(now - 3_600_000).toISOString(),
  },
  {
    id: "demo-2", nodeId: "demo-2", number: 39, title: "Підключення GitHub organization з вибором репозиторіїв", body: "", state: "open", status: "Todo", url: "#", repository: "git-master/app", labels: [{ name: "github", color: "c5def5" }], author: undefined, assignees: [], commentCount: 1, updatedAt: new Date(now - 86_400_000).toISOString(),
  },
  {
    id: "demo-3", nodeId: "demo-3", number: 36, title: "Завантаження скриншотів у коментарі", body: "![attachment](demo)", state: "open", status: "Review", url: "#", repository: "git-master/app", labels: [{ name: "ux", color: "efd6ff" }], author: undefined, assignees: [], commentCount: 3, updatedAt: new Date(now - 172_800_000).toISOString(),
  },
  {
    id: "demo-4", nodeId: "demo-4", number: 31, title: "Налаштувати encrypted storage для access tokens", body: "", state: "closed", status: "Done", url: "#", repository: "git-master/app", labels: [{ name: "security", color: "f9d0c4" }], author: undefined, assignees: [], commentCount: 2, updatedAt: new Date(now - 345_600_000).toISOString(),
  },
  {
    id: "demo-5", nodeId: "demo-5", number: 45, title: "Додати шаблони для bug report та feature request", body: "", state: "open", status: "Backlog", url: "#", repository: "git-master/app", labels: [{ name: "enhancement", color: "a2eeef" }], author: undefined, assignees: [], commentCount: 0, updatedAt: new Date(now - 43_200_000).toISOString(),
  },
  {
    id: "demo-6", nodeId: "demo-6", number: 41, title: "Command palette для швидкої навігації", body: "", state: "open", status: "Todo", url: "#", repository: "git-master/app", labels: [{ name: "frontend", color: "fef2c0" }], author: undefined, assignees: [], commentCount: 2, updatedAt: new Date(now - 65_000_000).toISOString(),
  },
];

const initialDemoBoard: Board = { source: "demo", statuses: FALLBACK_STATUSES, issues: demoIssues };

function normalizedStatus(value: string) {
  return value.trim().replace(/^[«“\"']+|[»”\"'.,!?;:]+$/g, "").replace(/\s+/g, " ").toLocaleLowerCase("uk-UA");
}

export function Workspace() {
  const router = useRouter();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [connectionId, setConnectionId] = useState("");
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [repository, setRepository] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [board, setBoard] = useState<Board>(initialDemoBoard);
  const [loadingBoard, setLoadingBoard] = useState(false);
  const [loadingWorkspace, setLoadingWorkspace] = useState(true);
  const [connectOpen, setConnectOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingIssue, setEditingIssue] = useState<BoardIssue | null>(null);
  const [initialStatus, setInitialStatus] = useState<StatusOption | undefined>();
  const [search, setSearch] = useState("");
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [moving, setMoving] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editorCommand, setEditorCommand] = useState<EditorVoiceCommand>();
  const [shortcuts, setShortcuts] = useState<ShortcutSettings>(DEFAULT_SHORTCUTS);
  const [voiceCommands, setVoiceCommands] = useState<VoiceCommandSettings>(DEFAULT_VOICE_COMMANDS);
  const [voiceLatched, setVoiceLatched] = useState(false);
  const boardRequestId = useRef(0);
  const voiceCenterRef = useRef<VoiceCommandHandle>(null);
  const activeVoiceKeyRef = useRef("");
  const pushToTalkRef = useRef<PushToTalkController | null>(null);

  useEffect(() => {
    const controller = new PushToTalkController(
      () => voiceCenterRef.current?.start(),
      () => voiceCenterRef.current?.stop(),
      setVoiceLatched,
    );
    pushToTalkRef.current = controller;
    return () => {
      controller.reset();
      pushToTalkRef.current = null;
    };
  }, []);

  const notify = useCallback((message: string, type: "success" | "error" = "success") => {
    const id = Date.now() + Math.random();
    setToasts((items) => [...items, { id, message, type }]);
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 5200);
  }, []);

  useEffect(() => {
    setShortcuts(parseShortcutSettings(window.localStorage.getItem(SHORTCUTS_STORAGE_KEY)));
    setVoiceCommands(parseVoiceCommandSettings(window.localStorage.getItem(VOICE_COMMANDS_STORAGE_KEY)));
  }, []);

  const saveShortcuts = useCallback((next: ShortcutSettings) => {
    pushToTalkRef.current?.reset();
    setShortcuts(next);
    window.localStorage.setItem(SHORTCUTS_STORAGE_KEY, JSON.stringify(next));
  }, []);

  const saveVoiceCommands = useCallback((next: VoiceCommandSettings) => {
    setVoiceCommands(next);
    window.localStorage.setItem(VOICE_COMMANDS_STORAGE_KEY, JSON.stringify(next));
  }, []);

  const loadConnections = useCallback(async () => {
    try {
      const result = await api<{ connections: Connection[] }>("/api/connections");
      setConnections(result.connections);
      const existing = connectionId && result.connections.some((item) => item.id === connectionId);
      const stored = typeof window !== "undefined" ? window.localStorage.getItem("git-master-connection") : "";
      const next = existing ? connectionId : result.connections.find((item) => item.id === stored)?.id || result.connections[0]?.id || "";
      setConnectionId(next);
      if (next) window.localStorage.setItem("git-master-connection", next);
      if (!result.connections.length) {
        setRepositories([]);
        setRepository("");
        setBoard(initialDemoBoard);
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не вдалося завантажити підключення", "error");
    } finally {
      setLoadingWorkspace(false);
    }
  }, [connectionId, notify]);

  useEffect(() => { void loadConnections(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!connectionId) return;
    let active = true;
    setLoadingWorkspace(true);
    setRepositories([]);
    setRepository("");
    setProjectId("");
    api<{ repositories: Repository[] }>(`/api/github/repositories?connectionId=${encodeURIComponent(connectionId)}`)
      .then((result) => {
        if (!active) return;
        setRepositories(result.repositories);
        const stored = window.localStorage.getItem(`git-master-repository:${connectionId}`);
        const next = result.repositories.find((item) => item.fullName === stored)?.fullName || result.repositories[0]?.fullName || "";
        setRepository(next);
      })
      .catch((error) => notify(error instanceof Error ? error.message : "Не вдалося завантажити репозиторії", "error"))
      .finally(() => active && setLoadingWorkspace(false));
    return () => { active = false; };
  }, [connectionId, notify]);

  useEffect(() => {
    if (!connectionId || !repository) return;
    window.localStorage.setItem(`git-master-repository:${connectionId}`, repository);
    let active = true;
    setProjects([]);
    setProjectId("");
    const query = new URLSearchParams({ connectionId, repository });
    api<{ projects: Project[] }>(`/api/github/projects?${query}`)
      .then((result) => {
        if (!active) return;
        setProjects(result.projects.filter((project) => !project.closed));
        const stored = window.localStorage.getItem(`git-master-project:${repository}`);
        setProjectId(result.projects.find((project) => project.id === stored)?.id || "");
      })
      .catch(() => { if (active) setProjects([]); });
    return () => { active = false; };
  }, [connectionId, repository]);

  const loadBoard = useCallback(async () => {
    if (!connectionId || !repository) return;
    const requestId = ++boardRequestId.current;
    setLoadingBoard(true);
    try {
      const query = new URLSearchParams({ connectionId, repository });
      if (projectId) query.set("projectId", projectId);
      const result = await api<{ board: Board }>(`/api/github/board?${query}`);
      if (requestId === boardRequestId.current) setBoard(result.board);
    } catch (error) {
      if (requestId === boardRequestId.current) {
        notify(error instanceof Error ? error.message : "Не вдалося завантажити дошку", "error");
      }
    } finally {
      if (requestId === boardRequestId.current) setLoadingBoard(false);
    }
  }, [connectionId, repository, projectId, notify]);

  useEffect(() => { void loadBoard(); }, [loadBoard]);

  const visibleBoard = useMemo<Board>(() => {
    const query = search.trim().toLowerCase();
    if (!query) return board;
    return {
      ...board,
      issues: board.issues.filter((issue) => `${issue.title} ${issue.body} ${issue.labels.map((label) => label.name).join(" ")} #${issue.number}`.toLowerCase().includes(query)),
    };
  }, [board, search]);

  const saveIssueToBoard = useCallback((savedIssue: BoardIssue) => {
    setBoard((current) => {
      const existingIndex = current.issues.findIndex((issue) => issue.number === savedIssue.number && issue.repository === savedIssue.repository);
      if (existingIndex === -1) return { ...current, issues: [savedIssue, ...current.issues] };
      return {
        ...current,
        issues: current.issues.map((issue, index) => index === existingIndex ? {
          ...issue,
          ...savedIssue,
          itemId: savedIssue.itemId || issue.itemId,
        } : issue),
      };
    });
  }, []);

  const handleIssueSaved = useCallback((savedIssue: BoardIssue) => {
    if (!editingIssue) setSearch("");
    saveIssueToBoard(savedIssue);
  }, [editingIssue, saveIssueToBoard]);

  const deleteIssueFromBoard = useCallback((deletedIssue: BoardIssue) => {
    setBoard((current) => ({
      ...current,
      issues: current.issues.filter((issue) => issue.number !== deletedIssue.number || issue.repository !== deletedIssue.repository),
    }));
  }, []);

  const newIssue = useCallback((status?: StatusOption) => {
    if (!connectionId) { setConnectOpen(true); return; }
    setEditingIssue(null);
    setInitialStatus(status || board.statuses.find((item) => item.name.toLowerCase() === "todo") || board.statuses[0]);
    setEditorOpen(true);
  }, [board.statuses, connectionId]);

  useEffect(() => {
    const controller = pushToTalkRef.current;
    if (!controller) return;

    const keydown = (event: KeyboardEvent) => {
      if (connectOpen || settingsOpen) return;
      const editable = isEditableShortcutTarget(event.target);

      if (matchesShortcut(event, shortcuts.voice)) {
        if (editable && !hasShortcutModifier(shortcuts.voice)) return;
        event.preventDefault();
        if (event.repeat) return;
        activeVoiceKeyRef.current = event.code;
        controller.press(event.timeStamp || Date.now());
        return;
      }

      if (matchesShortcut(event, shortcuts.newIssue)) {
        if (editable && !hasShortcutModifier(shortcuts.newIssue)) return;
        event.preventDefault();
        if (event.repeat) return;
        if (editorOpen) {
          notify("Закрийте поточний редактор перед створенням нової задачі", "error");
          return;
        }
        newIssue();
      }
    };

    const keyup = (event: KeyboardEvent) => {
      if (event.code !== activeVoiceKeyRef.current) return;
      event.preventDefault();
      activeVoiceKeyRef.current = "";
      controller.release(event.timeStamp || Date.now());
    };

    const resetVoice = () => {
      activeVoiceKeyRef.current = "";
      controller.reset();
    };

    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("blur", resetVoice);
    return () => {
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", resetVoice);
      resetVoice();
    };
  }, [connectOpen, editorOpen, newIssue, notify, settingsOpen, shortcuts]);

  function openIssue(issue: BoardIssue) {
    if (board.source === "demo") { setConnectOpen(true); return; }
    setEditingIssue(issue);
    setInitialStatus(undefined);
    setEditorOpen(true);
  }

  async function moveIssue(issue: BoardIssue, status: StatusOption) {
    if (board.source === "demo") {
      setBoard((value) => ({ ...value, issues: value.issues.map((item) => item.id === issue.id ? { ...item, status: status.name } : item) }));
      return true;
    }
    if (!connectionId || !repository) return false;
    const previous = board;
    setMoving(issue.id);
    setBoard((value) => ({ ...value, issues: value.issues.map((item) => item.id === issue.id ? { ...item, status: status.name } : item) }));
    try {
      await api("/api/github/status", jsonInit("PATCH", {
        connectionId,
        repository,
        issueNumber: issue.number,
        status: status.name,
        labels: issue.labels.map((label) => label.name),
        state: issue.state,
        projectId: board.projectId,
        itemId: issue.itemId,
        fieldId: board.statusFieldId,
        optionId: status.id,
      }));
      return true;
    } catch (error) {
      setBoard(previous);
      notify(error instanceof Error ? error.message : "Не вдалося змінити статус", "error");
      return false;
    } finally {
      setMoving("");
    }
  }

  async function issueByNumber(issueNumber: number) {
    const boardIssue = board.issues.find((issue) => issue.number === issueNumber && issue.repository === repository);
    if (boardIssue) return boardIssue;
    if (!connectionId || !repository || board.source === "demo") return undefined;
    const query = new URLSearchParams({ connectionId, repository });
    const result = await api<{ issue: BoardIssue }>(`/api/github/issues/${issueNumber}?${query}`);
    return result.issue;
  }

  async function handleVoiceCommand(command: VoiceCommand) {
    if (command.action === "open_create") { newIssue(); return; }
    if (command.action === "open_issue") {
      try {
        const issue = await issueByNumber(command.issueNumber);
        if (!issue) { notify(`Issue #${command.issueNumber} не знайдено в поточному репозиторії`, "error"); return; }
        openIssue(issue);
      } catch (error) {
        notify(error instanceof Error ? error.message : `Не вдалося відкрити issue #${command.issueNumber}`, "error");
      }
      return;
    }
    if (command.action === "delete_issue") {
      const issueNumber = command.issueNumber || editingIssue?.number;
      if (!issueNumber) { notify("Назвіть номер issue, яке потрібно видалити", "error"); return; }
      try {
        const issue = editingIssue?.number === issueNumber ? editingIssue : await issueByNumber(issueNumber);
        if (!issue) { notify(`Issue #${issueNumber} не знайдено в поточному репозиторії`, "error"); return; }
        setEditingIssue(issue);
        setInitialStatus(undefined);
        setEditorOpen(true);
        setEditorCommand({ id: Date.now(), command: { action: "delete_issue", issueNumber } });
      } catch (error) {
        notify(error instanceof Error ? error.message : `Не вдалося відкрити issue #${issueNumber}`, "error");
      }
      return;
    }
    if (command.action === "move_issue") {
      const issueNumber = command.issueNumber || editingIssue?.number;
      if (!issueNumber) { notify("Назвіть номер issue, яке потрібно перенести", "error"); return; }
      const issue = board.issues.find((item) => item.number === issueNumber && item.repository === repository);
      if (!issue) { notify(`Issue #${issueNumber} немає на поточній дошці`, "error"); return; }
      if (command.sourceStatus && normalizedStatus(command.sourceStatus) !== normalizedStatus(issue.status)) {
        notify(`Issue #${issueNumber} зараз у «${issue.status}», а не в «${command.sourceStatus}»`, "error");
        return;
      }
      const target = board.statuses.find((status) => normalizedStatus(status.name) === normalizedStatus(command.targetStatus));
      if (!target) {
        notify(`Колонку «${command.targetStatus}» не знайдено. Доступні: ${board.statuses.map((status) => status.name).join(", ")}`, "error");
        return;
      }
      if (normalizedStatus(issue.status) === normalizedStatus(target.name)) {
        notify(`Issue #${issueNumber} вже у колонці «${target.name}»`);
        return;
      }
      const moved = await moveIssue(issue, target);
      if (moved) {
        if (editorOpen && editingIssue?.number === issueNumber) {
          setEditorCommand({ id: Date.now(), command: { ...command, targetStatus: target.name } });
        }
        notify(`Issue #${issueNumber} перенесено в «${target.name}»`);
      }
      return;
    }
    if (command.action === "search") { setSearch(command.value); return; }
    if (command.action === "refresh") { await loadBoard(); return; }
    if (command.action === "close_panel") {
      if (editorOpen) notify(editingIssue ? "Редагування закрито без збереження" : "Створення issue скасовано");
      setEditorOpen(false);
      return;
    }
    if (command.action === "unknown") {
      if (editorOpen && command.value) {
        setEditorCommand({ id: Date.now(), command: { action: "append_body", value: command.value } });
        return;
      }
      notify("Не зрозумів команду. Спробуйте сформулювати дію конкретніше.", "error");
      return;
    }
    if (!editorOpen) {
      if (command.action === "submit_issue") { notify("Спочатку відкрийте або створіть задачу", "error"); return; }
      newIssue();
    }
    setEditorCommand({ id: Date.now(), command });
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const activeConnection = connections.find((item) => item.id === connectionId);
  const activeProject = projects.find((item) => item.id === projectId);

  return (
    <main className="flex h-svh min-h-[620px] overflow-hidden bg-[#f5f6f2] text-[#101315]">
      <Toasts items={toasts} dismiss={(id) => setToasts((items) => items.filter((item) => item.id !== id))} />

      <aside className="hidden w-[218px] shrink-0 flex-col bg-[#101315] text-white lg:flex">
        <div className="flex h-16 items-center gap-2.5 px-5">
          <img src="/logo.svg" alt="" className="h-8 w-8" />
          <span className="text-sm font-semibold tracking-[-.01em]">GIT MASTER</span>
        </div>
        <nav className="mt-4 space-y-1 px-3">
          <button className="flex h-10 w-full items-center gap-3 rounded-lg bg-white/9 px-3 text-left text-xs font-medium text-white"><KanbanSquare size={16} className="text-[#b9ec55]" /> Board</button>
          <button onClick={() => document.querySelector<HTMLInputElement>("#global-search")?.focus()} className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-xs font-medium text-white/55 transition hover:bg-white/6 hover:text-white"><Search size={16} /> Issues</button>
          <button onClick={() => voiceCenterRef.current?.toggle()} className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-xs font-medium text-white/55 transition hover:bg-white/6 hover:text-white"><AudioLines size={16} /><span className="flex-1">Voice commands</span><kbd className="text-[9px] text-white/30">{formatShortcut(shortcuts.voice)}</kbd></button>
        </nav>
        <div className="mt-8 px-5 text-[9px] font-semibold uppercase tracking-[.16em] text-white/28">Workspace</div>
        <div className="mt-3 px-3">
          {connections.map((connection) => (
            <button key={connection.id} onClick={() => { setConnectionId(connection.id); window.localStorage.setItem("git-master-connection", connection.id); }} className={cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition", connection.id === connectionId ? "bg-white/7" : "hover:bg-white/5") }>
              {connection.avatarUrl ? <img src={connection.avatarUrl} alt="" className="h-6 w-6 rounded-full" /> : <span className="grid h-6 w-6 place-items-center rounded-full bg-white/10"><Github size={13} /></span>}
              <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-white/70">{connection.name}</span>
              {connection.id === connectionId && <span className="h-1.5 w-1.5 rounded-full bg-[#b9ec55]" />}
            </button>
          ))}
          <button onClick={() => setConnectOpen(true)} className="mt-1 flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[11px] font-medium text-white/38 transition hover:bg-white/5 hover:text-white/70"><Plus size={14} /> Connect GitHub</button>
        </div>
        <div className="mt-auto border-t border-white/7 p-3">
          <button onClick={() => setSettingsOpen(true)} className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-xs text-white/48 hover:bg-white/6 hover:text-white"><Settings2 size={16} /> Settings</button>
          <button onClick={logout} className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-xs text-white/48 hover:bg-white/6 hover:text-white"><LogOut size={16} /> Sign out</button>
        </div>
      </aside>

      <AnimatePresence>
        {sidebarOpen && (
          <motion.div className="fixed inset-0 z-40 bg-[#101315]/45 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSidebarOpen(false)}>
            <motion.aside initial={{ x: -240 }} animate={{ x: 0 }} exit={{ x: -240 }} onClick={(event) => event.stopPropagation()} className="flex h-full w-[240px] flex-col bg-[#101315] p-4 text-white">
              <div className="flex items-center gap-2.5"><img src="/logo.svg" alt="" className="h-8 w-8" /><span className="text-sm font-semibold">GIT MASTER</span><button className="ml-auto" onClick={() => setSidebarOpen(false)}><X size={19} /></button></div>
              <button onClick={() => { setConnectOpen(true); setSidebarOpen(false); }} className="mt-8 flex h-10 items-center gap-3 rounded-lg bg-white/8 px-3 text-xs"><Github size={16} /> Connections</button>
              <button onClick={() => { setSettingsOpen(true); setSidebarOpen(false); }} className="mt-2 flex h-10 items-center gap-3 rounded-lg px-3 text-xs text-white/65 hover:bg-white/7"><Settings2 size={16} /> Settings</button>
              <button onClick={logout} className="mt-auto flex h-10 items-center gap-3 px-3 text-xs text-white/55"><LogOut size={16} /> Sign out</button>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-2 border-b border-[#e1e4de] bg-[#fbfcf9] px-4 sm:px-6 lg:px-8">
          <button onClick={() => setSidebarOpen(true)} className="focus-ring grid h-9 w-9 place-items-center rounded-full lg:hidden" aria-label="Меню"><Menu size={19} /></button>
          <div className="hidden items-center gap-2 text-xs text-[#8b9189] sm:flex"><Github size={15} /><span className="max-w-24 truncate">{activeConnection?.name || "Demo"}</span><span>/</span></div>
          <div className="relative">
            <select value={repository} onChange={(event) => setRepository(event.target.value)} disabled={!repositories.length} className="focus-ring h-9 max-w-[180px] appearance-none rounded-lg border border-[#dfe2dc] bg-white py-0 pl-3 pr-8 text-xs font-semibold disabled:text-[#858b83] sm:max-w-[240px]">
              {!repositories.length && <option>{connections.length ? "No repositories" : "git-master/app"}</option>}
              {repositories.map((repo) => <option key={repo.id} value={repo.fullName}>{repo.fullName}</option>)}
            </select>
            <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-3 text-[#838981]" />
          </div>
          <div className="relative hidden sm:block">
            <select value={projectId} onChange={(event) => { setProjectId(event.target.value); if (event.target.value) window.localStorage.setItem(`git-master-project:${repository}`, event.target.value); else window.localStorage.removeItem(`git-master-project:${repository}`); }} disabled={!repository} className="focus-ring h-9 max-w-[200px] appearance-none rounded-lg border border-[#dfe2dc] bg-white py-0 pl-3 pr-8 text-xs disabled:text-[#858b83]">
              <option value="">Repository issues</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
            </select>
            <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-3 text-[#838981]" />
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <div className="relative hidden md:block">
              <Search size={14} className="absolute left-3 top-2.5 text-[#92978f]" />
              <input id="global-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search issues" className="focus-ring h-9 w-44 rounded-full border border-[#dfe2dc] bg-white pl-8 pr-3 text-xs xl:w-56" />
            </div>
            <button type="button" onClick={loadBoard} disabled={loadingBoard || board.source === "demo"} aria-label="Оновити" className="focus-ring grid h-9 w-9 place-items-center rounded-full text-[#676d66] hover:bg-[#e9ebe5] disabled:opacity-40"><RefreshCw size={16} className={loadingBoard ? "animate-spin" : ""} /></button>
            <button type="button" aria-label="New issue" aria-keyshortcuts={formatShortcut(shortcuts.newIssue)} onClick={() => newIssue()} className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-full bg-[#101315] px-3.5 text-xs font-semibold text-white transition hover:bg-[#292e30]"><Plus size={15} /><span className="hidden sm:inline">New issue</span><kbd className="ml-1 hidden text-[9px] font-medium text-white/45 xl:inline">{formatShortcut(shortcuts.newIssue)}</kbd></button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-end justify-between gap-5 px-4 pb-3 pt-6 sm:px-6 lg:px-8">
            <div>
              <div className="mb-1.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.13em] text-[#858b83]"><CircleDot size={12} className="text-[#6f982c]" />{board.source === "demo" ? "Demo workspace" : board.source === "project" ? "GitHub Project" : "Repository board"}</div>
              <h1 className="text-2xl font-semibold tracking-[-.04em] sm:text-3xl">{activeProject?.title || (repository ? repository.split("/")[1] : "Product board")}</h1>
              <p className="mt-1 text-xs text-[#858b83]">{board.issues.length} issues · {board.issues.filter((issue) => issue.state === "open").length} open</p>
            </div>
            <button className="hidden h-8 items-center gap-2 rounded-full border border-[#dfe2dc] bg-white px-3 text-[11px] text-[#6f756e] hover:border-[#c5cac2] sm:flex"><SlidersHorizontal size={13} /> Filter</button>
          </div>

          {board.source === "demo" && !loadingWorkspace && (
            <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="mx-4 mb-2 flex items-center gap-3 rounded-xl bg-[#eaf4d8] px-4 py-2.5 text-xs text-[#4e6726] sm:mx-6 lg:mx-8">
              <Command size={15} className="shrink-0" />
              <span className="min-w-0 flex-1">Це інтерактивне демо. Підключіть GitHub, щоб працювати з реальними issues.</span>
              <button onClick={() => setConnectOpen(true)} className="shrink-0 rounded-full bg-[#101315] px-3 py-1.5 text-[10px] font-semibold text-white">Connect</button>
            </motion.div>
          )}

          <div className="relative min-h-0 flex-1">
            {loadingBoard && (
              <div className="absolute inset-0 z-10 grid place-items-center bg-[#f5f6f2]/70 backdrop-blur-[1px]"><div className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-medium shadow"><LoaderCircle size={15} className="animate-spin text-[#739d30]" /> Синхронізація з GitHub</div></div>
            )}
            <Kanban board={visibleBoard} onOpen={openIssue} onCreate={newIssue} onMove={async (issue, status) => { await moveIssue(issue, status); }} moving={moving} />
          </div>
        </div>
      </section>

      <ConnectDialog open={connectOpen} onClose={() => setConnectOpen(false)} connections={connections} onChanged={loadConnections} notify={notify} />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} shortcuts={shortcuts} voiceCommands={voiceCommands} onChange={saveShortcuts} onVoiceCommandsChange={saveVoiceCommands} notify={notify} />
      <IssueDrawer
        open={editorOpen}
        issue={editingIssue}
        initialStatus={initialStatus}
        board={board}
        connectionId={connectionId}
        repository={repository}
        voiceCommand={editorCommand}
        onClose={() => setEditorOpen(false)}
        onSaved={handleIssueSaved}
        onDeleted={deleteIssueFromBoard}
        notify={notify}
      />
      <VoiceCommandCenter
        ref={voiceCenterRef}
        context={{ repository: repository || "demo", project: activeProject?.title, editorOpen, editingIssue: editingIssue?.number, issueTitle: editingIssue?.title, search, voiceCommands }}
        onCommand={handleVoiceCommand}
        notify={notify}
        shortcutHint={formatShortcut(shortcuts.voice)}
        latched={voiceLatched}
        onReleaseLatch={() => pushToTalkRef.current?.reset()}
        editorMode={editorOpen}
      />
    </main>
  );
}
