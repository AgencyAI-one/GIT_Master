"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AudioLines, Keyboard, RotateCcw, Save, X } from "lucide-react";
import {
  DEFAULT_SHORTCUTS,
  formatShortcut,
  shortcutFromKeyboardEvent,
  shortcutSignature,
  type ShortcutBinding,
  type ShortcutSettings,
} from "@/lib/shortcuts";
import { cn } from "@/lib/cn";
import {
  aliasesFromText,
  DEFAULT_VOICE_COMMANDS,
  type VoiceCommandSettings,
} from "@/lib/voice-command-settings";

type CommandDraft = Record<keyof VoiceCommandSettings, string>;

function commandDraft(settings: VoiceCommandSettings = DEFAULT_VOICE_COMMANDS): CommandDraft {
  return {
    editIssue: settings.editIssue.join(", "),
    deleteIssue: settings.deleteIssue.join(", "),
    moveIssue: settings.moveIssue.join(", "),
    issueNouns: settings.issueNouns.join(", "),
  };
}

function CommandAliases(props: {
  label: string;
  detail: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block border-b border-[#e6e8e3] py-4 last:border-0">
      <span className="text-sm font-semibold text-[#202421]">{props.label}</span>
      <span className="mt-1 block text-xs leading-5 text-[#7e847c]">{props.detail}</span>
      <textarea
        aria-label={props.label}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        rows={2}
        className="focus-ring mt-3 w-full resize-y rounded-xl border border-[#d9ddd5] bg-[#fbfcf9] px-3 py-2.5 text-xs leading-5 text-[#303530]"
      />
    </label>
  );
}

function ShortcutRecorder(props: {
  label: string;
  detail: string;
  value: ShortcutBinding;
  onChange: (value: ShortcutBinding) => void;
}) {
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    if (!capturing) return;
    const capture = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setCapturing(false);
        return;
      }
      const binding = shortcutFromKeyboardEvent(event);
      if (!binding) return;
      props.onChange(binding);
      setCapturing(false);
    };
    window.addEventListener("keydown", capture, true);
    return () => window.removeEventListener("keydown", capture, true);
  }, [capturing, props]);

  return (
    <div className="flex flex-col gap-3 border-b border-[#e6e8e3] py-4 last:border-0 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-[#202421]">{props.label}</div>
        <p className="mt-1 text-xs leading-5 text-[#7e847c]">{props.detail}</p>
      </div>
      <button
        type="button"
        aria-label={`Змінити комбінацію: ${props.label}`}
        aria-pressed={capturing}
        onClick={() => setCapturing(true)}
        className={cn(
          "focus-ring flex h-11 min-w-40 items-center justify-center rounded-xl border px-4 text-xs font-semibold transition",
          capturing
            ? "border-[#7da82f] bg-[#edf8d8] text-[#4e6d1d]"
            : "border-[#d9ddd5] bg-white text-[#303530] hover:border-[#aeb5aa]",
        )}
      >
        {capturing ? "Натисніть клавіші…" : formatShortcut(props.value)}
      </button>
    </div>
  );
}

export function SettingsDialog(props: {
  open: boolean;
  shortcuts: ShortcutSettings;
  voiceCommands: VoiceCommandSettings;
  onClose: () => void;
  onChange: (shortcuts: ShortcutSettings) => void;
  onVoiceCommandsChange: (commands: VoiceCommandSettings) => void;
  notify: (message: string, type?: "success" | "error") => void;
}) {
  const { open, shortcuts, onClose } = props;
  const [draft, setDraft] = useState(props.shortcuts);
  const [commands, setCommands] = useState<CommandDraft>(() => commandDraft(props.voiceCommands));

  useEffect(() => {
    if (!open) return;
    setDraft(shortcuts);
    setCommands(commandDraft(props.voiceCommands));
  }, [open, shortcuts, props.voiceCommands]);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open, onClose]);

  function save() {
    if (shortcutSignature(draft.voice) === shortcutSignature(draft.newIssue)) {
      props.notify("Для голосу й нової задачі потрібні різні комбінації", "error");
      return;
    }
    const nextCommands = {
      editIssue: aliasesFromText(commands.editIssue),
      deleteIssue: aliasesFromText(commands.deleteIssue),
      moveIssue: aliasesFromText(commands.moveIssue),
      issueNouns: aliasesFromText(commands.issueNouns),
    };
    if (Object.values(nextCommands).some((aliases) => aliases.length === 0)) {
      props.notify("Кожна група голосових команд повинна мати хоча б один варіант", "error");
      return;
    }
    props.onChange(draft);
    props.onVoiceCommandsChange(nextCommands);
    props.notify("Налаштування збережено");
    props.onClose();
  }

  function resetDefaults() {
    setDraft(DEFAULT_SHORTCUTS);
    setCommands(commandDraft(DEFAULT_VOICE_COMMANDS));
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#101315]/55 p-0 backdrop-blur-[3px] sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => event.target === event.currentTarget && props.onClose()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Налаштування"
            initial={{ y: 28, opacity: 0, scale: .985 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 22, opacity: 0, scale: .985 }}
            transition={{ type: "spring", stiffness: 360, damping: 34 }}
            className="app-shadow max-h-[94svh] w-full max-w-[640px] overflow-y-auto rounded-t-3xl bg-[#fbfcf9] sm:rounded-2xl"
          >
            <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[#e5e7e2] bg-[#fbfcf9]/95 px-6 py-5 backdrop-blur sm:px-8">
              <div>
                <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.14em] text-[#6c922a]"><Keyboard size={13} /> Controls</div>
                <h2 className="text-xl font-semibold tracking-[-.025em]">Налаштування</h2>
              </div>
              <button type="button" onClick={props.onClose} aria-label="Закрити" className="focus-ring grid h-9 w-9 place-items-center rounded-full hover:bg-[#eceee8]"><X size={18} /></button>
            </header>

            <div className="p-6 sm:p-8">
              <div className="rounded-2xl border border-[#e0e3dc] bg-white px-4 sm:px-5">
                <ShortcutRecorder
                  label="Голосова команда"
                  detail="Утримуйте клавіші як кнопку рації. Подвійне натискання залишає запис увімкненим до наступного натискання."
                  value={draft.voice}
                  onChange={(voice) => setDraft((current) => ({ ...current, voice }))}
                />
                <ShortcutRecorder
                  label="Нова задача"
                  detail="Відкриває створення issue у поточному репозиторії."
                  value={draft.newIssue}
                  onChange={(newIssue) => setDraft((current) => ({ ...current, newIssue }))}
                />
              </div>

              <p className="mt-4 text-[11px] leading-5 text-[#858b83]">
                Натисніть поле комбінації, а потім потрібні клавіші. Комбінації зберігаються лише в цьому браузері. Звичайні клавіші без модифікаторів не спрацьовують під час введення тексту.
              </p>

              <section className="mt-8">
                <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.14em] text-[#6c922a]"><AudioLines size={13} /> Голосові команди</div>
                <h3 className="text-base font-semibold tracking-[-.02em]">Власні слова та синоніми</h3>
                <p className="mt-1 text-xs leading-5 text-[#7e847c]">Розділяйте варіанти комою або новим рядком. Команда має починатися з одного з цих слів; номер issue і назви колонок визначаються автоматично.</p>
                <div className="mt-4 rounded-2xl border border-[#e0e3dc] bg-white px-4 sm:px-5">
                  <CommandAliases
                    label="Редагувати issue"
                    detail="Наприклад: «Редагувати задачу 432» або «Edit issue 432»."
                    value={commands.editIssue}
                    onChange={(editIssue) => setCommands((current) => ({ ...current, editIssue }))}
                  />
                  <CommandAliases
                    label="Видалити issue"
                    detail="Наприклад: «Знищити таск 432». Перед видаленням завжди буде підтвердження."
                    value={commands.deleteIssue}
                    onChange={(deleteIssue) => setCommands((current) => ({ ...current, deleteIssue }))}
                  />
                  <CommandAliases
                    label="Перенести issue"
                    detail="Наприклад: «Перенести задачу 432 з In progress в Review»."
                    value={commands.moveIssue}
                    onChange={(moveIssue) => setCommands((current) => ({ ...current, moveIssue }))}
                  />
                  <CommandAliases
                    label="Назви задачі"
                    detail="Слова між дією та номером: задача, таск, issue, ішю тощо."
                    value={commands.issueNouns}
                    onChange={(issueNouns) => setCommands((current) => ({ ...current, issueNouns }))}
                  />
                </div>
                <p className="mt-3 text-[11px] leading-5 text-[#858b83]">Ці налаштування також зберігаються лише в поточному браузері та передаються серверу тільки разом із транскрибованою командою.</p>
              </section>

              <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-[#e5e7e2] pt-5">
                <button type="button" onClick={resetDefaults} className="focus-ring inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium text-[#676d66] hover:bg-[#eceee9]"><RotateCcw size={14} /> За замовчуванням</button>
                <div className="ml-auto flex gap-2">
                  <button type="button" onClick={props.onClose} className="focus-ring h-10 rounded-full px-4 text-sm font-medium text-[#676d66] hover:bg-[#eceee9]">Скасувати</button>
                  <button type="button" onClick={save} className="focus-ring inline-flex h-10 items-center gap-2 rounded-full bg-[#101315] px-5 text-sm font-semibold text-white hover:bg-[#252a2d]"><Save size={14} /> Зберегти</button>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
