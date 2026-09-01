"use client";

import { useCallback, useRef, useState } from "react";
import { api } from "@/lib/client-api";

function bestMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  return ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

export function useVoiceRecorder(options: {
  context?: string;
  language?: string;
  onTranscript: (text: string) => void | Promise<void>;
  onError?: (message: string) => void;
}) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const discardRef = useRef(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  const start = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        throw new Error("Цей браузер не підтримує запис аудіо");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      chunksRef.current = [];
      discardRef.current = false;
      const mimeType = bestMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (discardRef.current) {
          chunksRef.current = [];
          discardRef.current = false;
          return;
        }
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (!blob.size) return;
        setTranscribing(true);
        try {
          const form = new FormData();
          const extension = blob.type.includes("mp4") ? "m4a" : "webm";
          form.set("audio", blob, `voice-${Date.now()}.${extension}`);
          form.set("language", options.language || "auto");
          if (options.context) form.set("context", options.context);
          const result = await api<{ text: string }>("/api/voice/transcribe", { method: "POST", body: form });
          if (result.text) await options.onTranscript(result.text);
        } catch (error) {
          options.onError?.(error instanceof Error ? error.message : "Не вдалося розпізнати голос");
        } finally {
          setTranscribing(false);
        }
      };
      recorder.start(250);
      setRecording(true);
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      options.onError?.(error instanceof Error ? error.message : "Немає доступу до мікрофона");
    }
  }, [options]);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    setRecording(false);
  }, []);

  const cancel = useCallback(() => {
    discardRef.current = true;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    else streamRef.current?.getTracks().forEach((track) => track.stop());
    setRecording(false);
  }, []);

  const toggle = useCallback(() => (recording ? stop() : void start()), [recording, start, stop]);

  return { recording, transcribing, toggle, start, stop, cancel };
}
