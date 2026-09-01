"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, Check, CircleDot, FileText, LoaderCircle, MessageSquare, Pencil, Sparkles, Trash2, X } from "lucide-react";
import type { Board, BoardIssue, IssueComment, StatusOption, VoiceCommand } from "@/lib/types";
import { api, jsonInit } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import { TextComposer } from "./text-composer";
import { VoiceButton } from "./voice-button";

export type EditorVoiceCommand = { id: number; command: VoiceCommand };

function appendText(value: string, insertion: string) {
  return value ? `${value}${/[\s\n]$/.test(value) ? "" : "\n\n"}${insertion}` : insertion;
}

async function uploadFiles(files: File[], input: { connectionId: string; repository: string; issueNumber: number }) {
  const markdown: string[] = [];
  for (const file of files) {
    const form = new FormData();
    form.set("connectionId", input.connectionId);
    form.set("repository", input.repository);
    form.set("issueNumber", String(input.issueNumber));
    form.set("file", file);
    const result = await api<{ attachment: { markdown: string } }>("/api/github/attachments", { method: "POST", body: form });
    markdown.push(result.attachment.markdown);
  }
  return markdown;
}

export function IssueDrawer(props: {
  open: boolean;
  issue: BoardIssue | null;
  initialStatus?: StatusOption;
  board: Board;
  connectionId?: string;
  repository?: string;
  voiceCommand?: EditorVoiceCommand;
  onClose: () => void;
  onSaved: (issue: BoardIssue) => Promise<void> | void;
  onDeleted: (issue: BoardIssue) => Promise<void> | void;
  notify: (message: string, type?: "success" | "error") => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [statusId, setStatusId] = useState("");
  const [labels, setLabels] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [generatingTitle, setGeneratingTitle] = useState(false);
  const [tab, setTab] = useState<"details" | "comments">("details");
  const [comments, setComments] = useState<IssueComment[]>([]);
  const [comment, setComment] = useState("");
  const [commentFiles, setCommentFiles] = useState<File[]>([]);
  const [commenting, setCommenting] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editingComment, setEditingComment] = useState("");
  const [editingCommentFiles, setEditingCommentFiles] = useState<File[]>([]);
  const [savingComment, setSavingComment] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const handledCommand = useRef(0);
  const commentIssue = props.issue;
  const commentConnectionId = props.connectionId;
  const commentRepository = props.repository;
  const commentNotify = props.notify;

  const selectedStatus = props.board.statuses.find((status) => status.id === statusId) || props.board.statuses[0];

  useEffect(() => {
    if (!props.open) return;
    setTitle(props.issue?.title || "");
    setBody(props.issue?.body || "");
    setStatusId(props.initialStatus?.id || props.board.statuses.find((status) => status.name.toLowerCase() === props.issue?.status.toLowerCase())?.id || props.board.statuses[0]?.id || "");
    setLabels(props.issue?.labels.map((label) => label.name).join(", ") || "");
    setFiles([]);
    setComment("");
    setCommentFiles([]);
    setComments([]);
    setEditingCommentId(null);
    setEditingComment("");
    setEditingCommentFiles([]);
    setDeleteConfirm(false);
    setTab("details");
  }, [props.open, props.issue, props.initialStatus, props.board.statuses]);

  const loadComments = useCallback(async () => {
    if (!commentIssue || !commentConnectionId || !commentRepository) return;
    try {
      const query = new URLSearchParams({ connectionId: commentConnectionId, repository: commentRepository });
      const result = await api<{ comments: IssueComment[] }>(`/api/github/issues/${commentIssue.number}/comments?${query}`);
      setComments(result.comments);
    } catch (error) {
      commentNotify(error instanceof Error ? error.message : "Не вдалося завантажити коментарі", "error");
    }
  }, [commentIssue, commentConnectionId, commentRepository, commentNotify]);

  useEffect(() => {
    if (tab === "comments") void loadComments();
  }, [tab, loadComments]);

  useEffect(() => {
    if (!props.open) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && props.onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [props]);

  async function generatedTitle() {
    if (!body.trim() || !props.repository) {
      props.notify("Спочатку додайте опис задачі", "error");
      return "";
    }
    setGeneratingTitle(true);
    try {
      const result = await api<{ title: string }>("/api/voice/title", jsonInit("POST", { body, repository: props.repository }));
      setTitle(result.title);
      return result.title;
    } catch (error) {
      props.notify(error instanceof Error ? error.message : "Не вдалося створити назву", "error");
      return "";
    } finally {
      setGeneratingTitle(false);
    }
  }

  const save = useCallback(async () => {
    if (!props.connectionId || !props.repository || !selectedStatus) {
      props.notify("Спочатку підключіть і виберіть GitHub repository", "error");
      return;
    }
    if (!title.trim() && !body.trim()) {
      props.notify("Додайте опис або назву задачі", "error");
      return;
    }
    setSaving(true);
    try {
      let finalTitle = title.trim();
      if (!finalTitle) {
        const result = await api<{ title: string }>("/api/voice/title", jsonInit("POST", { body, repository: props.repository }));
        finalTitle = result.title;
        setTitle(finalTitle);
      }
      const labelList = labels.split(",").map((label) => label.trim()).filter(Boolean);
      let issueNumber = props.issue?.number;
      let finalBody = body;
      let savedIssue: BoardIssue;
      if (props.issue) {
        const result = await api<{ issue: BoardIssue }>(`/api/github/issues/${props.issue.number}`, jsonInit("PATCH", {
          connectionId: props.connectionId,
          repository: props.repository,
          title: finalTitle,
          body: finalBody,
          labels: labelList,
        }));
        savedIssue = { ...result.issue, itemId: props.issue.itemId, statusOptionId: props.issue.statusOptionId };
      } else {
        const result = await api<{ issue: BoardIssue; warnings?: string[] }>("/api/github/issues", jsonInit("POST", {
          connectionId: props.connectionId,
          repository: props.repository,
          projectId: props.board.projectId,
          statusFieldId: props.board.statusFieldId,
          statusOptionId: selectedStatus.id,
          status: selectedStatus.name,
          title: finalTitle,
          body: finalBody,
          labels: labelList,
        }));
        issueNumber = result.issue.number;
        savedIssue = result.issue;
        result.warnings?.forEach((warning) => props.notify(warning, "error"));
      }
      if (files.length && issueNumber) {
        const attachments = await uploadFiles(files, { connectionId: props.connectionId, repository: props.repository, issueNumber });
        finalBody = appendText(finalBody, attachments.join("\n\n"));
        const result = await api<{ issue: BoardIssue }>(`/api/github/issues/${issueNumber}`, jsonInit("PATCH", {
          connectionId: props.connectionId,
          repository: props.repository,
          body: finalBody,
        }));
        savedIssue = { ...savedIssue, ...result.issue, itemId: savedIssue.itemId, statusOptionId: savedIssue.statusOptionId };
      }
      if (props.issue && selectedStatus.name.toLowerCase() !== props.issue.status.toLowerCase()) {
        await api("/api/github/status", jsonInit("PATCH", {
          connectionId: props.connectionId,
          repository: props.repository,
          issueNumber: props.issue.number,
          status: selectedStatus.name,
          labels: labelList,
          state: props.issue.state,
          projectId: props.board.projectId,
          itemId: props.issue.itemId,
          fieldId: props.board.statusFieldId,
          optionId: selectedStatus.id,
        }));
      }
      savedIssue = {
        ...savedIssue,
        title: finalTitle,
        body: finalBody,
        status: selectedStatus.name,
        statusOptionId: selectedStatus.id,
        itemId: savedIssue.itemId || props.issue?.itemId,
        updatedAt: new Date().toISOString(),
      };
      props.notify(props.issue ? "Issue оновлено" : "Issue створено");
      await props.onSaved(savedIssue);
      props.onClose();
    } catch (error) {
      props.notify(error instanceof Error ? error.message : "Не вдалося зберегти issue", "error");
    } finally {
      setSaving(false);
    }
  }, [props, selectedStatus, title, body, labels, files]);

  useEffect(() => {
    const payload = props.voiceCommand;
    if (!payload || payload.id === handledCommand.current || !props.open) return;
    handledCommand.current = payload.id;
    const command = payload.command;
    if (command.action === "set_title") setTitle(command.value);
    if (command.action === "append_body") setBody((value) => appendText(value, command.value));
    if (command.action === "append_comment") { setTab("comments"); setComment((value) => appendText(value, command.value)); }
    if (command.action === "submit_issue") void save();
    if (command.action === "close_panel") props.onClose();
    if (command.action === "delete_issue" && props.issue) setDeleteConfirm(true);
    if (command.action === "move_issue") {
      const target = props.board.statuses.find((status) => status.name.trim().toLocaleLowerCase("uk-UA") === command.targetStatus.trim().toLocaleLowerCase("uk-UA"));
      if (target) setStatusId(target.id);
    }
  }, [props, save]);

  async function postComment() {
    if (!props.issue || !props.connectionId || !props.repository || (!comment.trim() && !commentFiles.length)) return;
    setCommenting(true);
    try {
      const attachments = await uploadFiles(commentFiles, {
        connectionId: props.connectionId,
        repository: props.repository,
        issueNumber: props.issue.number,
      });
      const finalComment = appendText(comment.trim(), attachments.join("\n\n"));
      const result = await api<{ comments: IssueComment[] }>(`/api/github/issues/${props.issue.number}/comments`, jsonInit("POST", {
        connectionId: props.connectionId,
        repository: props.repository,
        body: finalComment,
      }));
      setComments(result.comments);
      setComment("");
      setCommentFiles([]);
      props.notify("Коментар додано");
    } catch (error) {
      props.notify(error instanceof Error ? error.message : "Не вдалося додати коментар", "error");
    } finally {
      setCommenting(false);
    }
  }

  function beginCommentEdit(item: IssueComment) {
    setEditingCommentId(item.id);
    setEditingComment(item.body);
    setEditingCommentFiles([]);
  }

  function cancelCommentEdit() {
    setEditingCommentId(null);
    setEditingComment("");
    setEditingCommentFiles([]);
  }

  async function saveCommentEdit() {
    if (!props.issue || !props.connectionId || !props.repository || !editingCommentId || (!editingComment.trim() && !editingCommentFiles.length)) return;
    setSavingComment(true);
    try {
      const attachments = await uploadFiles(editingCommentFiles, {
        connectionId: props.connectionId,
        repository: props.repository,
        issueNumber: props.issue.number,
      });
      const finalBody = appendText(editingComment.trim(), attachments.join("\n\n"));
      const result = await api<{ comment: IssueComment }>(`/api/github/issues/${props.issue.number}/comments/${editingCommentId}`, jsonInit("PATCH", {
        connectionId: props.connectionId,
        repository: props.repository,
        body: finalBody,
      }));
      setComments((items) => items.map((item) => item.id === result.comment.id ? result.comment : item));
      cancelCommentEdit();
      props.notify("Коментар оновлено");
    } catch (error) {
      props.notify(error instanceof Error ? error.message : "Не вдалося оновити коментар", "error");
    } finally {
      setSavingComment(false);
    }
  }

  async function deleteIssue() {
    if (!props.issue || !props.connectionId || !props.repository) return;
    setDeleting(true);
    try {
      await api(`/api/github/issues/${props.issue.number}`, jsonInit("DELETE", {
        connectionId: props.connectionId,
        repository: props.repository,
      }));
      await props.onDeleted(props.issue);
      props.notify(`Issue #${props.issue.number} видалено`);
      props.onClose();
    } catch (error) {
      props.notify(error instanceof Error ? error.message : "Не вдалося видалити issue", "error");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AnimatePresence>
      {props.open && (
        <>
          <motion.button aria-label="Закрити редактор" className="fixed inset-0 z-40 cursor-default bg-[#101315]/18 backdrop-blur-[1px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={props.onClose} />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={props.issue ? `Issue ${props.issue.number}` : "Нове issue"}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 360, damping: 38 }}
            className="app-shadow fixed inset-y-0 right-0 z-50 flex w-full max-w-[680px] flex-col bg-[#fbfcf9]"
          >
            <header className="flex h-16 shrink-0 items-center gap-3 border-b border-[#e5e7e2] px-5 sm:px-7">
              <span className="flex items-center gap-1.5 text-xs font-medium text-[#747a73]"><CircleDot size={14} className="text-[#769f32]" />{props.issue ? `${props.repository} #${props.issue.number}` : "New issue"}</span>
              <div className="ml-auto flex items-center gap-1">
                {props.issue && <a href={props.issue.url} target="_blank" rel="noreferrer" className="focus-ring grid h-9 w-9 place-items-center rounded-full text-[#71776f] hover:bg-[#eceee9]" aria-label="Відкрити на GitHub"><ArrowUpRight size={17} /></a>}
                <button type="button" onClick={props.onClose} className="focus-ring grid h-9 w-9 place-items-center rounded-full text-[#71776f] hover:bg-[#eceee9]" aria-label="Закрити"><X size={18} /></button>
              </div>
            </header>

            {props.issue && (
              <div className="flex h-12 shrink-0 items-end gap-5 border-b border-[#e5e7e2] px-5 sm:px-7">
                <button type="button" onClick={() => setTab("details")} className={cn("flex h-full items-center gap-2 border-b-2 text-xs font-semibold", tab === "details" ? "border-[#101315] text-[#101315]" : "border-transparent text-[#8c928a]")}><FileText size={14} /> Деталі</button>
                <button type="button" onClick={() => setTab("comments")} className={cn("flex h-full items-center gap-2 border-b-2 text-xs font-semibold", tab === "comments" ? "border-[#101315] text-[#101315]" : "border-transparent text-[#8c928a]")}><MessageSquare size={14} /> Коментарі <span className="text-[10px] font-medium">{comments.length || props.issue.commentCount || ""}</span></button>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto">
              {tab === "details" ? (
                <div className="space-y-6 p-5 sm:p-7">
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <label htmlFor="issue-title" className="text-[11px] font-semibold uppercase tracking-[.13em] text-[#7e847c]">Назва</label>
                      <button type="button" onClick={generatedTitle} disabled={generatingTitle || !body.trim()} className="focus-ring inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold text-[#5e7f27] hover:bg-[#edf5df] disabled:opacity-40">{generatingTitle ? <LoaderCircle size={12} className="animate-spin" /> : <Sparkles size={12} />} Створити з опису</button>
                    </div>
                    <div className="flex items-center rounded-xl border border-[#dfe2dc] bg-white px-3 focus-within:border-[#aab0a7] focus-within:ring-2 focus-within:ring-[#b9ec55]/25">
                      <input id="issue-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Назва згенерується автоматично, якщо лишити порожньою" className="h-12 min-w-0 flex-1 bg-transparent pr-2 text-sm font-medium outline-none placeholder:font-normal placeholder:text-[#a4aaa2]" />
                      <VoiceButton compact context={title} onTranscript={(text) => setTitle((value) => value ? `${value} ${text}` : text)} onError={(message) => props.notify(message, "error")} />
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[.13em] text-[#7e847c]">Опис</label>
                    <TextComposer value={body} onChange={setBody} files={files} onFiles={setFiles} minHeight={260} placeholder="Опишіть очікуваний результат, контекст і критерії готовності…" onError={(message) => props.notify(message, "error")} />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[.13em] text-[#7e847c]">Статус</span>
                      <select value={statusId} onChange={(event) => setStatusId(event.target.value)} className="focus-ring h-11 w-full rounded-lg border border-[#dfe2dc] bg-white px-3 text-sm">
                        {props.board.statuses.map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[.13em] text-[#7e847c]">Labels</span>
                      <input value={labels} onChange={(event) => setLabels(event.target.value)} placeholder="bug, frontend, priority" className="focus-ring h-11 w-full rounded-lg border border-[#dfe2dc] bg-white px-3 text-sm" />
                    </label>
                  </div>
                  <p className="text-[11px] leading-5 text-[#92978f]">Вкладення буде збережено в <code>.git-master/uploads/issue-…</code> цього репозиторію та вставлено як Markdown.</p>
                </div>
              ) : (
                <div className="p-5 sm:p-7">
                  <div className="space-y-5">
                    {comments.map((item) => (
                      <article key={item.id} className="group flex gap-3">
                        <img src={item.author.avatarUrl} alt="" className="mt-0.5 h-8 w-8 shrink-0 rounded-full bg-[#e8eae5]" />
                        <div className="min-w-0 flex-1 border-b border-[#e7e9e4] pb-5">
                          <div className="mb-1.5 flex items-center gap-2 text-xs">
                            <strong>{item.author.login}</strong>
                            <span className="text-[#969b94]">{new Date(item.createdAt).toLocaleString("uk-UA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                            {item.updatedAt !== item.createdAt && <span className="text-[10px] text-[#a0a59e]">ред.</span>}
                            {editingCommentId !== item.id && (
                              <button type="button" onClick={() => beginCommentEdit(item)} aria-label={`Редагувати коментар ${item.id}`} className="focus-ring ml-auto inline-flex h-7 items-center gap-1 rounded-full px-2 text-[10px] font-semibold text-[#727971] opacity-100 hover:bg-[#eceee9] sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"><Pencil size={11} /> Редагувати</button>
                            )}
                          </div>
                          {editingCommentId === item.id ? (
                            <div className="pt-1">
                              <TextComposer value={editingComment} onChange={setEditingComment} files={editingCommentFiles} onFiles={setEditingCommentFiles} minHeight={120} placeholder="Відредагуйте коментар…" onError={(message) => props.notify(message, "error")} />
                              <div className="mt-2 flex justify-end gap-2">
                                <button type="button" onClick={cancelCommentEdit} disabled={savingComment} className="focus-ring h-8 rounded-full px-3 text-xs font-medium text-[#737972] hover:bg-[#eff1ec]">Скасувати</button>
                                <button type="button" onClick={saveCommentEdit} disabled={savingComment || (!editingComment.trim() && !editingCommentFiles.length)} className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-full bg-[#101315] px-3.5 text-xs font-semibold text-white disabled:opacity-40">{savingComment && <LoaderCircle size={12} className="animate-spin" />} Зберегти</button>
                              </div>
                            </div>
                          ) : (
                            <p className="whitespace-pre-wrap break-words text-sm leading-6 text-[#3e4340]">{item.body}</p>
                          )}
                        </div>
                      </article>
                    ))}
                    {!comments.length && <div className="py-10 text-center text-sm text-[#949a92]">Коментарів ще немає</div>}
                  </div>
                  <div className="mt-7 border-t border-[#e5e7e2] pt-6">
                    <TextComposer value={comment} onChange={setComment} files={commentFiles} onFiles={setCommentFiles} minHeight={120} placeholder="Додайте коментар текстом або голосом…" onError={(message) => props.notify(message, "error")} />
                    <div className="mt-3 flex justify-end">
                      <button type="button" onClick={postComment} disabled={commenting || (!comment.trim() && !commentFiles.length)} className="focus-ring inline-flex h-9 items-center gap-2 rounded-full bg-[#101315] px-4 text-xs font-semibold text-white disabled:opacity-40">{commenting && <LoaderCircle size={14} className="animate-spin" />} Коментувати</button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {tab === "details" && (
              <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-[#e5e7e2] bg-white px-5 py-4 sm:px-7">
                {props.issue ? deleteConfirm ? (
                  <div className="flex items-center gap-1.5">
                    <span className="hidden text-[11px] font-medium text-[#9f3434] sm:inline">Видалити назавжди?</span>
                    <button type="button" onClick={() => setDeleteConfirm(false)} disabled={deleting} className="focus-ring h-9 rounded-full px-3 text-xs font-medium text-[#6d736c] hover:bg-[#eff1ec]">Ні</button>
                    <button type="button" onClick={deleteIssue} disabled={deleting} className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-full bg-[#b83d3d] px-3.5 text-xs font-semibold text-white hover:bg-[#9f3131] disabled:opacity-50">{deleting ? <LoaderCircle size={13} className="animate-spin" /> : <Trash2 size={13} />} Так, видалити</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setDeleteConfirm(true)} className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-[#ad4040] hover:bg-[#fdecec]"><Trash2 size={13} /> Видалити</button>
                ) : (
                  <span className="hidden items-center gap-1.5 text-[11px] text-[#8d938b] sm:flex"><Check size={13} /> Зміни синхронізуються з GitHub</span>
                )}
                <div className="ml-auto flex gap-2">
                  <button type="button" onClick={props.onClose} className="focus-ring h-10 rounded-full px-4 text-sm font-medium text-[#6d736c] hover:bg-[#eff1ec]">Скасувати</button>
                  <button type="button" onClick={save} disabled={saving || (!title.trim() && !body.trim())} className="focus-ring inline-flex h-10 items-center gap-2 rounded-full bg-[#101315] px-5 text-sm font-semibold text-white transition hover:bg-[#272c2e] disabled:opacity-40">{saving && <LoaderCircle size={15} className="animate-spin" />}{props.issue ? "Зберегти" : "Створити issue"}</button>
                </div>
              </footer>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
