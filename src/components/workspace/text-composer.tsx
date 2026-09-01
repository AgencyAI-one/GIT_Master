"use client";

import { useEffect, useRef, useState } from "react";
import { ClipboardPaste, FileUp, FolderOpen, Image as ImageIcon, Paperclip, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { VoiceButton } from "./voice-button";

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

type ClipboardFileSource = {
  items?: ArrayLike<{ kind: string; type: string; getAsFile: () => File | null }>;
  files?: ArrayLike<File>;
};

type ClipboardReadSource = {
  read: () => Promise<ArrayLike<{
    types: readonly string[];
    getType: (type: string) => Promise<Blob>;
  }>>;
};

function attachmentKey(file: File) {
  return `${file.name}:${file.size}:${file.type}:${file.lastModified}`;
}

export function mergeAttachmentFiles(current: File[], incoming: File[]) {
  const known = new Set(current.map(attachmentKey));
  return [...current, ...incoming.filter((file) => {
    const key = attachmentKey(file);
    if (known.has(key)) return false;
    known.add(key);
    return true;
  })];
}

export function clipboardImageFiles(source: ClipboardFileSource, timestamp = Date.now()) {
  const itemFiles = Array.from(source.items || [])
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));
  const images = (itemFiles.length ? itemFiles : Array.from(source.files || []))
    .filter((file) => file.type.startsWith("image/"));

  return images.map((file, index) => {
    if (file.name) return file;
    const extension = file.type.split("/")[1]?.replace("jpeg", "jpg").replace(/[^a-z0-9]+/gi, "") || "png";
    return new File([file], `clipboard-${timestamp}-${index + 1}.${extension}`, {
      type: file.type,
      lastModified: file.lastModified || timestamp,
    });
  });
}

export async function readClipboardImageFiles(source: ClipboardReadSource, timestamp = Date.now()) {
  const items = Array.from(await source.read());
  const images: File[] = [];

  for (const item of items) {
    const imageType = item.types.find((type) => type.startsWith("image/"));
    if (!imageType) continue;
    const blob = await item.getType(imageType);
    const extension = imageType.split("/")[1]?.replace("jpeg", "jpg").replace(/[^a-z0-9]+/gi, "") || "png";
    images.push(new File([blob], `clipboard-${timestamp}-${images.length + 1}.${extension}`, {
      type: imageType,
      lastModified: timestamp,
    }));
  }

  return images;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function insertAtSelection(value: string, insertion: string, start: number, end: number) {
  const before = value.slice(0, start);
  const after = value.slice(end);
  const prefix = before && !/[\s\n]$/.test(before) ? " " : "";
  const suffix = after && !/^[\s\n.,!?;:]/.test(after) ? " " : "";
  return { value: `${before}${prefix}${insertion}${suffix}${after}`, cursor: start + prefix.length + insertion.length + suffix.length };
}

export function TextComposer(props: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: number;
  files?: File[];
  onFiles?: (files: File[]) => void;
  onError?: (message: string) => void;
  label?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const selection = useRef({ start: props.value.length, end: props.value.length });
  const dragDepth = useRef(0);
  const statusTimer = useRef<number | undefined>(undefined);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [attachmentStatus, setAttachmentStatus] = useState("");

  useEffect(() => () => {
    if (statusTimer.current) window.clearTimeout(statusTimer.current);
  }, []);

  function announce(message: string) {
    if (statusTimer.current) window.clearTimeout(statusTimer.current);
    setAttachmentStatus(message);
    statusTimer.current = window.setTimeout(() => setAttachmentStatus(""), 3200);
  }

  function addFiles(incoming: File[], source: "picker" | "drop" | "clipboard") {
    if (!props.onFiles || !incoming.length) return;
    const accepted = incoming.filter((file) => file.size <= MAX_ATTACHMENT_BYTES);
    const rejected = incoming.filter((file) => file.size > MAX_ATTACHMENT_BYTES);
    if (rejected.length) {
      props.onError?.(`Файл завеликий (максимум 10 MB): ${rejected.map((file) => file.name || "зображення").join(", ")}`);
    }
    const current = props.files || [];
    const next = mergeAttachmentFiles(current, accepted);
    const added = next.length - current.length;
    if (!added) {
      if (accepted.length) announce("Ці файли вже додані");
      return;
    }
    props.onFiles(next);
    const imageWord = added === 1 ? "зображення" : added < 5 ? "зображення" : "зображень";
    const fileWord = added === 1 ? "файл" : added < 5 ? "файли" : "файлів";
    announce(source === "clipboard" ? `Вставлено ${added} ${imageWord}` : `Додано ${added} ${fileWord}`);
  }

  function hasDraggedFiles(event: React.DragEvent) {
    return event.dataTransfer.files.length > 0 || Array.from(event.dataTransfer.types).includes("Files");
  }

  function rememberSelection() {
    const node = ref.current;
    if (node) selection.current = { start: node.selectionStart, end: node.selectionEnd };
  }

  function insertTranscript(text: string) {
    const position = selection.current;
    const next = insertAtSelection(props.value, text, position.start, position.end);
    props.onChange(next.value);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(next.cursor, next.cursor);
      selection.current = { start: next.cursor, end: next.cursor };
    });
  }

  return (
    <div
      onPaste={(event) => {
        if (!props.onFiles) return;
        const images = clipboardImageFiles(event.clipboardData);
        if (!images.length) return;
        event.preventDefault();
        addFiles(images, "clipboard");
      }}
      onDragEnter={(event) => {
        if (!props.onFiles || !hasDraggedFiles(event)) return;
        event.preventDefault();
        dragDepth.current += 1;
        setDraggingFiles(true);
      }}
      onDragOver={(event) => {
        if (!props.onFiles || !hasDraggedFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setDraggingFiles(true);
      }}
      onDragLeave={(event) => {
        if (!props.onFiles || !draggingFiles) return;
        event.preventDefault();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDraggingFiles(false);
      }}
      onDrop={(event) => {
        if (!props.onFiles || !hasDraggedFiles(event)) return;
        event.preventDefault();
        dragDepth.current = 0;
        setDraggingFiles(false);
        addFiles(Array.from(event.dataTransfer.files), "drop");
      }}
      className={cn(
        "relative overflow-hidden rounded-xl border bg-white transition focus-within:border-[#aab0a7] focus-within:ring-2 focus-within:ring-[#b9ec55]/25",
        draggingFiles ? "border-[#7da82f]" : "border-[#dfe2dc]",
      )}
    >
      {draggingFiles && (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center rounded-xl border-2 border-[#7da82f] bg-[#f1f8e5]/95 backdrop-blur-[2px]">
          <div className="flex items-center gap-3 text-[#4f6e1f]">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-[#b9ec55]"><FileUp size={18} /></span>
            <div><p className="text-sm font-semibold">Відпустіть файли</p><p className="mt-0.5 text-[11px] text-[#718052]">Вони будуть додані до цього тексту</p></div>
          </div>
        </div>
      )}
      {props.label && <div className="border-b border-[#eceee9] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[.12em] text-[#7b817a]">{props.label}</div>}
      <textarea
        ref={ref}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        onSelect={rememberSelection}
        onClick={rememberSelection}
        onKeyUp={rememberSelection}
        placeholder={props.placeholder}
        style={{ minHeight: props.minHeight || 210 }}
        className="block w-full resize-none bg-transparent px-4 py-3.5 text-sm leading-6 outline-none placeholder:text-[#a6aaa3]"
      />
      {props.files && props.files.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-[#eceee9] px-3 py-2.5">
          {props.files.map((file, index) => (
            <span key={`${file.name}-${index}`} className="inline-flex max-w-[240px] items-center gap-1.5 rounded-full bg-[#f0f2ed] px-2.5 py-1 text-[11px] text-[#555b55]">
              {file.type.startsWith("image/") ? <ImageIcon size={11} /> : <Paperclip size={11} />}
              <span className="truncate">{file.name || "clipboard image"}</span>
              <span className="shrink-0 text-[9px] text-[#92978f]">{formatFileSize(file.size)}</span>
              <button type="button" aria-label={`Видалити ${file.name}`} onClick={() => props.onFiles?.(props.files!.filter((_, itemIndex) => itemIndex !== index))} className="rounded-full hover:bg-black/5"><X size={12} /></button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between border-t border-[#eceee9] px-3 py-2">
        <div className="flex items-center gap-1">
          {props.onFiles && (
            <label className="focus-ring inline-flex h-8 cursor-pointer items-center gap-2 rounded-full px-2.5 text-xs font-medium text-[#656b65] hover:bg-[#f0f2ed]">
              <FolderOpen size={14} /> З диска
              <input
                type="file"
                multiple
                aria-label="Відкрити файли з диска"
                className="sr-only"
                onChange={(event) => {
                  addFiles(Array.from(event.target.files || []), "picker");
                  event.currentTarget.value = "";
                }}
              />
            </label>
          )}
          {props.onFiles && <span className="hidden items-center gap-1 text-[11px] text-[#a1a69e] sm:flex"><FileUp size={11} /> перетягніть</span>}
          {props.onFiles && <span className="hidden items-center gap-1 text-[11px] text-[#a1a69e] md:flex"><ClipboardPaste size={11} /> Ctrl/⌘+V для картинки</span>}
          {!props.onFiles && <span className="hidden text-[11px] text-[#a1a69e] sm:inline">Markdown підтримується</span>}
        </div>
        <span role="status" aria-live="polite" className="mr-auto truncate px-2 text-[10px] font-medium text-[#6b8e2d]">{attachmentStatus}</span>
        <VoiceButton context={props.value} onTranscript={insertTranscript} onError={props.onError} />
      </div>
    </div>
  );
}
