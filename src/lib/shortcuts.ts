export type ShortcutBinding = {
  code: string;
  alt: boolean;
  ctrl: boolean;
  shift: boolean;
  meta: boolean;
};

export type ShortcutSettings = {
  voice: ShortcutBinding;
  newIssue: ShortcutBinding;
};

export const DEFAULT_SHORTCUTS: ShortcutSettings = {
  voice: { code: "AltLeft", alt: true, ctrl: false, shift: false, meta: false },
  newIssue: { code: "KeyN", alt: true, ctrl: false, shift: false, meta: false },
};

export const SHORTCUTS_STORAGE_KEY = "git-master-shortcuts";

const MODIFIER_CODES = new Set(["AltLeft", "AltRight", "ControlLeft", "ControlRight", "ShiftLeft", "ShiftRight", "MetaLeft", "MetaRight"]);
const LEGACY_DEFAULT_VOICE = { code: "KeyV", alt: true, ctrl: false, shift: false, meta: false };

function modifierBinding(code: string): ShortcutBinding | null {
  if (code === "AltLeft" || code === "AltRight") return { code, alt: true, ctrl: false, shift: false, meta: false };
  if (code === "ControlLeft" || code === "ControlRight") return { code, alt: false, ctrl: true, shift: false, meta: false };
  if (code === "ShiftLeft" || code === "ShiftRight") return { code, alt: false, ctrl: false, shift: true, meta: false };
  if (code === "MetaLeft" || code === "MetaRight") return { code, alt: false, ctrl: false, shift: false, meta: true };
  return null;
}

export function shortcutFromKeyboardEvent(event: Pick<KeyboardEvent, "code" | "altKey" | "ctrlKey" | "shiftKey" | "metaKey">): ShortcutBinding | null {
  if (!event.code) return null;
  if (MODIFIER_CODES.has(event.code)) return modifierBinding(event.code);
  return {
    code: event.code,
    alt: event.altKey,
    ctrl: event.ctrlKey,
    shift: event.shiftKey,
    meta: event.metaKey,
  };
}

export function matchesShortcut(event: Pick<KeyboardEvent, "code" | "altKey" | "ctrlKey" | "shiftKey" | "metaKey">, binding: ShortcutBinding) {
  return event.code === binding.code &&
    event.altKey === binding.alt &&
    event.ctrlKey === binding.ctrl &&
    event.shiftKey === binding.shift &&
    event.metaKey === binding.meta;
}

export function shortcutSignature(binding: ShortcutBinding) {
  return `${binding.meta ? "M" : ""}${binding.ctrl ? "C" : ""}${binding.alt ? "A" : ""}${binding.shift ? "S" : ""}:${binding.code}`;
}

function keyLabel(code: string) {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return ({
    Space: "Space",
    Enter: "Enter",
    Escape: "Esc",
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    Backquote: "`",
    BracketLeft: "[",
    BracketRight: "]",
    Semicolon: ";",
    Quote: "'",
    Comma: ",",
    Period: ".",
    Slash: "/",
    Backslash: "\\",
    Minus: "-",
    Equal: "=",
  } as Record<string, string>)[code] || code.replace(/Left$|Right$/, "");
}

export function formatShortcut(binding: ShortcutBinding, isMac = false) {
  if (MODIFIER_CODES.has(binding.code)) {
    return keyLabel(binding.code);
  }
  const keys: string[] = [];
  if (binding.meta) keys.push(isMac ? "⌘" : "Meta");
  if (binding.ctrl) keys.push(isMac ? "⌃" : "Ctrl");
  if (binding.alt) keys.push(isMac ? "⌥" : "Alt");
  if (binding.shift) keys.push(isMac ? "⇧" : "Shift");
  keys.push(keyLabel(binding.code));
  return keys.join(isMac ? "" : "+");
}

export function hasShortcutModifier(binding: ShortcutBinding) {
  return binding.alt || binding.ctrl || binding.shift || binding.meta;
}

export function isModifierOnlyShortcut(binding: ShortcutBinding) {
  return MODIFIER_CODES.has(binding.code);
}

export function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
}

function isBinding(value: unknown): value is ShortcutBinding {
  if (!value || typeof value !== "object") return false;
  const binding = value as Record<string, unknown>;
  return typeof binding.code === "string" && binding.code.length > 0 &&
    typeof binding.alt === "boolean" && typeof binding.ctrl === "boolean" &&
    typeof binding.shift === "boolean" && typeof binding.meta === "boolean";
}

export function parseShortcutSettings(value: string | null): ShortcutSettings {
  if (!value) return DEFAULT_SHORTCUTS;
  try {
    const parsed = JSON.parse(value) as Partial<ShortcutSettings>;
    return {
      voice: isBinding(parsed.voice) && shortcutSignature(parsed.voice) !== shortcutSignature(LEGACY_DEFAULT_VOICE)
        ? parsed.voice
        : DEFAULT_SHORTCUTS.voice,
      newIssue: isBinding(parsed.newIssue) ? parsed.newIssue : DEFAULT_SHORTCUTS.newIssue,
    };
  } catch {
    return DEFAULT_SHORTCUTS;
  }
}

type Timer = ReturnType<typeof setTimeout>;

export class PushToTalkController {
  private lastPressAt = 0;
  private releaseTimer?: Timer;
  private active = false;
  private latched = false;
  private suppressUntil = 0;
  private starting?: Promise<void>;
  private stopRequested = false;
  private cancelRequested = false;

  constructor(
    private startRecording: () => void | Promise<void>,
    private stopRecording: () => void,
    private onLatchChange: (latched: boolean) => void,
    private doublePressMs = 300,
    private cancelRecording: () => void = stopRecording,
  ) {}

  press(now = Date.now()) {
    if (now < this.suppressUntil) return;
    if (this.latched) {
      this.latched = false;
      this.onLatchChange(false);
      this.suppressUntil = now + this.doublePressMs;
      this.requestStop();
      return;
    }

    if (this.lastPressAt > 0 && now - this.lastPressAt <= this.doublePressMs) {
      if (this.releaseTimer) clearTimeout(this.releaseTimer);
      this.releaseTimer = undefined;
      this.lastPressAt = 0;
      this.latched = true;
      this.onLatchChange(true);
      this.beginRecording();
      return;
    }

    this.lastPressAt = now;
    this.beginRecording();
  }

  release(now = Date.now()) {
    if (this.latched || now < this.suppressUntil) return;
    if (this.releaseTimer) clearTimeout(this.releaseTimer);
    const elapsed = now - this.lastPressAt;
    const remainingDoublePressWindow = Math.max(0, this.doublePressMs - elapsed);
    if (remainingDoublePressWindow === 0) {
      this.lastPressAt = 0;
      this.requestStop();
      return;
    }
    this.releaseTimer = setTimeout(() => {
      this.releaseTimer = undefined;
      this.lastPressAt = 0;
      this.requestStop();
    }, remainingDoublePressWindow);
  }

  reset() {
    if (this.releaseTimer) clearTimeout(this.releaseTimer);
    this.releaseTimer = undefined;
    this.lastPressAt = 0;
    this.suppressUntil = 0;
    if (this.latched) this.onLatchChange(false);
    this.latched = false;
    this.requestStop();
  }

  cancel() {
    if (this.releaseTimer) clearTimeout(this.releaseTimer);
    this.releaseTimer = undefined;
    this.lastPressAt = 0;
    this.suppressUntil = 0;
    if (this.latched) this.onLatchChange(false);
    this.latched = false;
    if (!this.active) return;
    if (this.starting) {
      this.cancelRequested = true;
      this.stopRequested = false;
      return;
    }
    this.finishCancel();
  }

  private beginRecording() {
    if (this.active) return;
    this.active = true;
    this.stopRequested = false;
    this.cancelRequested = false;
    try {
      const started = this.startRecording();
      if (!started || typeof started.then !== "function") return;
      this.starting = Promise.resolve(started).then(
        () => {
          this.starting = undefined;
          if (this.cancelRequested) this.finishCancel();
          else if (this.stopRequested) this.finishStop();
        },
        () => this.handleStartFailure(),
      );
    } catch {
      this.handleStartFailure();
    }
  }

  private requestStop() {
    if (!this.active) return;
    if (this.starting) {
      this.stopRequested = true;
      return;
    }
    this.finishStop();
  }

  private finishStop() {
    if (!this.active) return;
    this.stopRecording();
    this.active = false;
    this.stopRequested = false;
    this.cancelRequested = false;
  }

  private finishCancel() {
    if (!this.active) return;
    this.cancelRecording();
    this.active = false;
    this.stopRequested = false;
    this.cancelRequested = false;
  }

  private handleStartFailure() {
    this.starting = undefined;
    this.active = false;
    this.stopRequested = false;
    this.cancelRequested = false;
    if (this.latched) this.onLatchChange(false);
    this.latched = false;
  }
}
