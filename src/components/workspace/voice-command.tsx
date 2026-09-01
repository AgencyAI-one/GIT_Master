"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { LoaderCircle, Mic2, Sparkles, Square, X } from "lucide-react";
import type { VoiceCommand } from "@/lib/types";
import { api, jsonInit } from "@/lib/client-api";
import { useVoiceRecorder } from "./use-voice-recorder";

const actionLabels: Record<VoiceCommand["action"], string> = {
  open_create: "Відкриваю нову задачу",
  open_issue: "Відкриваю issue для редагування",
  delete_issue: "Відкриваю підтвердження видалення",
  move_issue: "Переношу issue в іншу колонку",
  set_title: "Змінюю назву",
  append_body: "Додаю до опису",
  append_comment: "Додаю коментар",
  attach_clipboard_image: "Додаю скріншот із clipboard",
  submit_issue: "Публікую issue",
  search: "Шукаю задачі",
  refresh: "Оновлюю дошку",
  close_panel: "Закриваю редактор",
  unknown: "Команду не розпізнано",
};

export type VoiceCommandHandle = {
  start: () => Promise<void> | void;
  stop: () => void;
  cancel: () => void;
  toggle: () => void;
};

export const VoiceCommandCenter = forwardRef<VoiceCommandHandle, {
  context: Record<string, unknown>;
  onCommand: (command: VoiceCommand) => Promise<void> | void;
  notify: (message: string, type?: "success" | "error") => void;
  shortcutHint: string;
  latched: boolean;
  onReleaseLatch: () => void;
  editorMode: boolean;
  editorTarget?: "body" | "comment";
}>(function VoiceCommandCenter(props, ref) {
  const [transcript, setTranscript] = useState("");
  const [result, setResult] = useState("");
  const [thinking, setThinking] = useState(false);
  const [open, setOpen] = useState(false);

  const voice = useVoiceRecorder({
    context: JSON.stringify(props.context),
    onError: (message) => props.notify(message, "error"),
    onTranscript: async (text) => {
      setTranscript(text);
      setThinking(true);
      setOpen(true);
      try {
        const response = await api<{ command: VoiceCommand }>("/api/voice/command", jsonInit("POST", { text, context: props.context }));
        setResult(actionLabels[response.command.action]);
        await props.onCommand(response.command);
      } catch (error) {
        props.notify(error instanceof Error ? error.message : "Не вдалося виконати команду", "error");
      } finally {
        setThinking(false);
      }
    },
  });

  useEffect(() => {
    if (voice.recording || voice.transcribing) setOpen(true);
  }, [voice.recording, voice.transcribing]);

  const start = useCallback(async () => {
    if (voice.recording || voice.transcribing) return;
    setTranscript("");
    setResult("");
    setOpen(true);
    await voice.start();
  }, [voice]);

  const toggle = useCallback(() => {
    if (props.latched) {
      props.onReleaseLatch();
      return;
    }
    if (!voice.recording) {
      setTranscript("");
      setResult("");
      setOpen(true);
    }
    voice.toggle();
  }, [props, voice]);

  useImperativeHandle(ref, () => ({ start, stop: voice.stop, cancel: voice.cancel, toggle }), [start, toggle, voice.cancel, voice.stop]);

  return (
    <div className="fixed bottom-5 right-5 z-30 flex flex-col items-end gap-3 sm:bottom-7 sm:right-7">
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: 10, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: .97 }} className="soft-shadow w-[min(330px,calc(100vw-40px))] rounded-2xl border border-[#e1e4dd] bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[.13em] text-[#747a72]"><Sparkles size={12} className="text-[#6d942b]" /> Voice command</span>
              <button type="button" onClick={() => setOpen(false)} aria-label="Сховати" className="text-[#9aa097] hover:text-[#313532]"><X size={14} /></button>
            </div>
            {voice.recording ? (
              <div className="flex items-center gap-3 py-2">
                <div className="voice-wave flex h-6 items-center gap-[3px] text-[#739e2e]">{[1,2,3,4,5].map((item) => <span key={item} />)}</div>
                <div><p className="text-sm font-semibold">{props.latched ? "Запис зафіксовано" : "Слухаю…"}</p><p className="mt-0.5 text-[11px] text-[#8d938b]">{props.latched ? `Натисніть ${props.shortcutHint}, щоб завершити` : props.editorMode ? "Диктуйте українською, English або разом" : "Скажіть команду українською або English"}</p></div>
              </div>
            ) : voice.transcribing || thinking ? (
              <div className="flex items-center gap-3 py-2"><LoaderCircle size={20} className="animate-spin text-[#739e2e]" /><div><p className="text-sm font-semibold">{voice.transcribing ? "Перетворюю на текст…" : "Розумію намір…"}</p>{transcript && <p className="mt-1 line-clamp-2 text-xs text-[#747a72]">“{transcript}”</p>}</div></div>
            ) : transcript ? (
              <div>
                <p className="text-sm leading-5 text-[#3d423e]">“{transcript}”</p>
                <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-[#628726]"><span className="grid h-4 w-4 place-items-center rounded-full bg-[#b9ec55]"><Sparkles size={9} /></span>{result}</p>
              </div>
            ) : (
              <div className="text-xs leading-5 text-[#777d75]">
                {props.editorMode ? (
                  <><p>{props.editorTarget === "comment" ? "Наступний запис буде додано до активного коментаря." : "Наступний запис буде додано до опису."} Можна диктувати кілька фрагментів поспіль.</p><p className="mt-2">Команди: “Збережи задачу” · “Скасуй задачу”.</p></>
                ) : (
                  <><p>Спробуйте: “Редагувати задачу 432” або “Move issue 432 to Review”.</p><p className="mt-2">Команди та їхні синоніми можна змінити в Settings.</p></>
                )}
                <p className="mt-2 font-medium text-[#596057]">Утримуйте {props.shortcutHint} · подвійне натискання фіксує запис</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <motion.button
        type="button"
        onClick={toggle}
        aria-label={voice.recording ? "Зупинити голосову команду" : "Голосова команда"}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: .96 }}
        className={`focus-ring relative grid h-14 w-14 place-items-center rounded-full shadow-[0_10px_32px_rgba(16,19,21,.24)] transition sm:h-16 sm:w-16 ${voice.recording ? "voice-halo bg-[#b9ec55] text-[#101315]" : "bg-[#101315] text-[#b9ec55]"}`}
      >
        {voice.transcribing || thinking ? <LoaderCircle size={22} className="animate-spin" /> : voice.recording ? <Square size={18} fill="currentColor" /> : <Mic2 size={23} />}
      </motion.button>
    </div>
  );
});

VoiceCommandCenter.displayName = "VoiceCommandCenter";
