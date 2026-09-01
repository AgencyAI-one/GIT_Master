import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SHORTCUTS, formatShortcut, matchesShortcut, parseShortcutSettings,
  PushToTalkController, shortcutFromKeyboardEvent, shortcutSignature,
} from "@/lib/shortcuts";

describe("keyboard shortcut bindings", () => {
  it("matches the physical key and exact modifiers", () => {
    expect(matchesShortcut({ code: "AltLeft", altKey: true, ctrlKey: false, shiftKey: false, metaKey: false }, DEFAULT_SHORTCUTS.voice)).toBe(true);
    expect(matchesShortcut({ code: "AltRight", altKey: true, ctrlKey: false, shiftKey: false, metaKey: false }, DEFAULT_SHORTCUTS.voice)).toBe(false);
    expect(matchesShortcut({ code: "KeyV", altKey: true, ctrlKey: false, shiftKey: false, metaKey: false }, DEFAULT_SHORTCUTS.voice)).toBe(false);
    expect(formatShortcut(DEFAULT_SHORTCUTS.voice)).toBe("Alt");
  });

  it("captures and formats a shortcut", () => {
    const binding = shortcutFromKeyboardEvent({ code: "Space", altKey: false, ctrlKey: true, shiftKey: true, metaKey: false });
    expect(binding).not.toBeNull();
    expect(formatShortcut(binding!)).toBe("Ctrl+Shift+Space");
    expect(shortcutSignature(binding!)).toBe("CS:Space");
  });

  it("captures a lone Alt key as a modifier-only shortcut", () => {
    const binding = shortcutFromKeyboardEvent({ code: "AltLeft", altKey: true, ctrlKey: false, shiftKey: false, metaKey: false });
    expect(binding).toEqual(DEFAULT_SHORTCUTS.voice);
  });

  it("recovers safely from malformed persisted settings", () => {
    expect(parseShortcutSettings("not json")).toEqual(DEFAULT_SHORTCUTS);
    expect(parseShortcutSettings(JSON.stringify({ voice: { code: 2 } }))).toEqual(DEFAULT_SHORTCUTS);
  });

  it("migrates the previous Alt+V default while preserving custom shortcuts", () => {
    expect(parseShortcutSettings(JSON.stringify({
      voice: { code: "KeyV", alt: true, ctrl: false, shift: false, meta: false },
      newIssue: DEFAULT_SHORTCUTS.newIssue,
    })).voice).toEqual(DEFAULT_SHORTCUTS.voice);
    expect(parseShortcutSettings(JSON.stringify({
      voice: { code: "Space", alt: false, ctrl: true, shift: true, meta: false },
      newIssue: DEFAULT_SHORTCUTS.newIssue,
    })).voice.code).toBe("Space");
  });
});

describe("push-to-talk controller", () => {
  afterEach(() => vi.useRealTimers());

  it("records while a normally-held key is down and stops on release", async () => {
    vi.useFakeTimers();
    const start = vi.fn();
    const stop = vi.fn();
    const controller = new PushToTalkController(start, stop, vi.fn(), 300);
    controller.press(1000);
    expect(start).toHaveBeenCalledOnce();
    controller.release(1500);
    await Promise.resolve();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("latches after a double press and stops on the next press", async () => {
    vi.useFakeTimers();
    const start = vi.fn();
    const stop = vi.fn();
    const latch = vi.fn();
    const controller = new PushToTalkController(start, stop, latch, 300);
    controller.press(1000);
    controller.release(1060);
    controller.press(1180);
    controller.release(1230);
    await vi.advanceTimersByTimeAsync(500);
    expect(start).toHaveBeenCalledOnce();
    expect(stop).not.toHaveBeenCalled();
    expect(latch).toHaveBeenLastCalledWith(true);

    controller.press(1800);
    await Promise.resolve();
    expect(stop).toHaveBeenCalledOnce();
    expect(latch).toHaveBeenLastCalledWith(false);
  });

  it("waits for microphone startup before honoring a quick release", async () => {
    let resolveStart!: () => void;
    const start = vi.fn(() => new Promise<void>((resolve) => { resolveStart = resolve; }));
    const stop = vi.fn();
    const controller = new PushToTalkController(start, stop, vi.fn(), 300);
    controller.press(1000);
    controller.release(1400);
    expect(stop).not.toHaveBeenCalled();
    resolveStart();
    await Promise.resolve();
    await Promise.resolve();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("cancels and discards a recording when Alt becomes part of another shortcut", async () => {
    const start = vi.fn();
    const stop = vi.fn();
    const cancel = vi.fn();
    const controller = new PushToTalkController(start, stop, vi.fn(), 300, cancel);
    controller.press(1000);
    controller.cancel();
    await Promise.resolve();
    expect(cancel).toHaveBeenCalledOnce();
    expect(stop).not.toHaveBeenCalled();
  });
});
