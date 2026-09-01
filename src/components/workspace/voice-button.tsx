"use client";

import { LoaderCircle, Mic, Square } from "lucide-react";
import { cn } from "@/lib/cn";
import { useVoiceRecorder } from "./use-voice-recorder";

export function VoiceButton(props: {
  context?: string;
  onTranscript: (text: string) => void;
  onError?: (message: string) => void;
  label?: string;
  compact?: boolean;
  className?: string;
}) {
  const voice = useVoiceRecorder({
    context: props.context,
    onTranscript: props.onTranscript,
    onError: props.onError,
  });
  const title = voice.recording ? "Зупинити запис" : voice.transcribing ? "Розпізнаємо…" : props.label || "Додати голосом";
  return (
    <button
      type="button"
      onClick={voice.toggle}
      disabled={voice.transcribing}
      aria-label={title}
      title={title}
      className={cn(
        "focus-ring inline-flex items-center justify-center gap-2 rounded-full text-xs font-semibold transition",
        voice.recording
          ? "voice-halo relative bg-[#101315] text-[#b9ec55]"
          : "bg-[#e9ebe5] text-[#525852] hover:bg-[#dfe2da]",
        props.compact ? "h-8 w-8" : "h-9 px-3.5",
        props.className,
      )}
    >
      {voice.transcribing ? <LoaderCircle size={15} className="animate-spin" /> : voice.recording ? <Square size={13} fill="currentColor" /> : <Mic size={15} />}
      {!props.compact && <span>{voice.recording ? "Стоп" : voice.transcribing ? "Слухаю…" : props.label || "Голос"}</span>}
    </button>
  );
}
