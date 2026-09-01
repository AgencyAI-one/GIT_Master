"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Building2, Check, ExternalLink, Github, KeyRound, LoaderCircle, Trash2, UserRound, X } from "lucide-react";
import type { Connection, ConnectionScope } from "@/lib/types";
import { api, jsonInit } from "@/lib/client-api";
import { cn } from "@/lib/cn";

const scopeOptions: Array<{ value: ConnectionScope; label: string; detail: string; icon: typeof UserRound }> = [
  { value: "account", label: "Акаунт", detail: "Усі доступні репозиторії", icon: UserRound },
  { value: "organization", label: "Організація", detail: "Репозиторії однієї org", icon: Building2 },
  { value: "repository", label: "Репозиторій", detail: "Найвужчий доступ", icon: Github },
];

export function ConnectDialog(props: {
  open: boolean;
  onClose: () => void;
  connections: Connection[];
  onChanged: () => Promise<void> | void;
  notify: (message: string, type?: "success" | "error") => void;
}) {
  const [scopeType, setScopeType] = useState<ConnectionScope>("repository");
  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");
  const [repository, setRepository] = useState("");
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!props.open) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && props.onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [props]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await api("/api/connections", jsonInit("POST", {
        scopeType,
        name: name || undefined,
        owner: scopeType === "account" ? undefined : owner,
        repository: scopeType === "repository" ? repository : undefined,
        token,
      }));
      setToken("");
      setName("");
      setOwner("");
      setRepository("");
      props.notify("GitHub успішно підключено");
      await props.onChanged();
    } catch (error) {
      props.notify(error instanceof Error ? error.message : "Не вдалося підключити GitHub", "error");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/api/connections/${id}`, { method: "DELETE" });
      props.notify("Підключення видалено");
      await props.onChanged();
    } catch (error) {
      props.notify(error instanceof Error ? error.message : "Не вдалося видалити", "error");
    }
  }

  return (
    <AnimatePresence>
      {props.open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-[#101315]/55 p-0 backdrop-blur-[3px] sm:items-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => event.target === event.currentTarget && props.onClose()}>
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Підключення GitHub"
            initial={{ y: 28, opacity: 0, scale: .985 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 22, opacity: 0, scale: .985 }}
            transition={{ type: "spring", stiffness: 360, damping: 34 }}
            className="app-shadow max-h-[94svh] w-full max-w-[720px] overflow-y-auto rounded-t-3xl bg-[#fbfcf9] sm:rounded-2xl"
          >
            <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[#e5e7e2] bg-[#fbfcf9]/95 px-6 py-5 backdrop-blur sm:px-8">
              <div>
                <h2 className="text-xl font-semibold tracking-[-.025em]">Підключення GitHub</h2>
                <p className="mt-1 text-xs text-[#7b8179]">Акаунт, організація або один репозиторій</p>
              </div>
              <button type="button" onClick={props.onClose} aria-label="Закрити" className="focus-ring grid h-9 w-9 place-items-center rounded-full hover:bg-[#eceee8]"><X size={18} /></button>
            </header>

            <div className="space-y-8 p-6 sm:p-8">
              {props.connections.length > 0 && (
                <section>
                  <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[.14em] text-[#858b83]">Активні підключення</h3>
                  <div className="divide-y divide-[#e8eae5] border-y border-[#e8eae5]">
                    {props.connections.map((connection) => (
                      <div key={connection.id} className="flex items-center gap-3 py-3">
                        {connection.avatarUrl ? <img src={connection.avatarUrl} alt="" className="h-9 w-9 rounded-full bg-[#e7e9e4]" /> : <span className="grid h-9 w-9 place-items-center rounded-full bg-[#e7e9e4]"><Github size={17} /></span>}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold">{connection.name}</div>
                          <div className="truncate text-xs text-[#858a83]">{connection.scopeType} · @{connection.login}</div>
                        </div>
                        <span className="hidden items-center gap-1 text-[11px] font-medium text-[#618520] sm:flex"><Check size={13} /> connected</span>
                        <button type="button" onClick={() => remove(connection.id)} aria-label={`Видалити ${connection.name}`} className="focus-ring grid h-8 w-8 place-items-center rounded-full text-[#949a92] hover:bg-[#feecec] hover:text-[#c34444]"><Trash2 size={15} /></button>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <form onSubmit={submit} className="space-y-5">
                <section>
                  <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[.14em] text-[#858b83]">Нове підключення</h3>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {scopeOptions.map((option) => {
                      const Icon = option.icon;
                      return (
                        <button key={option.value} type="button" onClick={() => setScopeType(option.value)} className={cn("focus-ring rounded-xl border p-3 text-left transition", scopeType === option.value ? "border-[#101315] bg-[#101315] text-white" : "border-[#dfe2dc] bg-white hover:border-[#b7bcb4]") }>
                          <Icon size={17} className={scopeType === option.value ? "text-[#b9ec55]" : "text-[#747b73]"} />
                          <span className="mt-3 block text-sm font-semibold">{option.label}</span>
                          <span className={cn("mt-0.5 block text-[11px]", scopeType === option.value ? "text-white/55" : "text-[#8b9189]")}>{option.detail}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-[#5d635c]">Назва <span className="text-[#999f97]">(необов’язково)</span></span>
                    <input value={name} onChange={(event) => setName(event.target.value)} placeholder="My workspace" className="focus-ring h-11 w-full rounded-lg border border-[#dfe2dc] bg-white px-3 text-sm" />
                  </label>
                  {scopeType !== "account" && (
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-[#5d635c]">{scopeType === "organization" ? "Organization login" : "Власник"}</span>
                      <input required value={owner} onChange={(event) => setOwner(event.target.value)} placeholder="AgencyAI-one" className="focus-ring h-11 w-full rounded-lg border border-[#dfe2dc] bg-white px-3 text-sm" />
                    </label>
                  )}
                  {scopeType === "repository" && (
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-[#5d635c]">Репозиторій</span>
                      <input required value={repository} onChange={(event) => setRepository(event.target.value)} placeholder="GIT_Master" className="focus-ring h-11 w-full rounded-lg border border-[#dfe2dc] bg-white px-3 text-sm" />
                    </label>
                  )}
                  <label className={cn("block", scopeType === "account" ? "sm:col-span-2" : scopeType === "repository" ? "sm:col-span-2" : "") }>
                    <span className="mb-1.5 flex items-center justify-between text-xs font-medium text-[#5d635c]">
                      <span>Fine-grained personal access token</span>
                      <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#53751a] hover:underline">Створити <ExternalLink size={11} /></a>
                    </span>
                    <div className="flex items-center rounded-lg border border-[#dfe2dc] bg-white px-3 focus-within:ring-2 focus-within:ring-[#b9ec55]/35">
                      <KeyRound size={15} className="text-[#8f958d]" />
                      <input required type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} placeholder="github_pat_••••••••••••" className="h-11 min-w-0 flex-1 bg-transparent px-2.5 text-sm outline-none" />
                    </div>
                    <p className="mt-2 text-[11px] leading-4 text-[#8b9189]">Потрібні Issues: read/write, Contents: read/write, Projects: read/write та Metadata: read. Token шифрується перед записом у SQLite.</p>
                  </label>
                </div>

                <div className="flex justify-end gap-2 border-t border-[#e7e9e4] pt-5">
                  <button type="button" onClick={props.onClose} className="focus-ring h-10 rounded-full px-4 text-sm font-medium text-[#676d66] hover:bg-[#eceee9]">Скасувати</button>
                  <button type="submit" disabled={saving || !token} className="focus-ring inline-flex h-10 items-center gap-2 rounded-full bg-[#101315] px-5 text-sm font-semibold text-white hover:bg-[#252a2d] disabled:opacity-50">
                    {saving && <LoaderCircle size={15} className="animate-spin" />} Підключити
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
