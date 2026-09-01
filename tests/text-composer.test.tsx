import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clipboardImageFiles,
  insertAtSelection,
  MAX_ATTACHMENT_BYTES,
  mergeAttachmentFiles,
  TextComposer,
} from "@/components/workspace/text-composer";

afterEach(cleanup);

describe("contextual voice insertion", () => {
  it("inserts a transcript at the current caret", () => {
    expect(insertAtSelection("Початок кінець", "важливий", 8, 8)).toEqual({
      value: "Початок важливий кінець",
      cursor: 17,
    });
  });

  it("replaces a selected fragment", () => {
    expect(insertAtSelection("hello old world", "new", 6, 9).value).toBe("hello new world");
  });

  it("does not add spaces before punctuation", () => {
    expect(insertAtSelection("Готово.", "майже", 6, 6).value).toBe("Готово майже.");
  });
});

describe("attachment input", () => {
  it("merges files without adding the same file twice", () => {
    const first = new File(["first"], "first.txt", { type: "text/plain", lastModified: 1 });
    const second = new File(["second"], "second.txt", { type: "text/plain", lastModified: 2 });
    expect(mergeAttachmentFiles([first], [first, second])).toEqual([first, second]);
  });

  it("extracts only clipboard images and names unnamed screenshots", () => {
    const image = new File(["image"], "", { type: "image/png", lastModified: 0 });
    const text = new File(["text"], "notes.txt", { type: "text/plain" });
    const files = clipboardImageFiles({
      items: [
        { kind: "file", type: image.type, getAsFile: () => image },
        { kind: "file", type: text.type, getAsFile: () => text },
      ],
    }, 1234);

    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("clipboard-1234-1.png");
    expect(files[0].type).toBe("image/png");
  });

  it("adds files selected from disk", () => {
    const onFiles = vi.fn();
    render(<TextComposer value="" onChange={() => undefined} files={[]} onFiles={onFiles} />);
    const file = new File(["document"], "requirements.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("Відкрити файли з диска"), { target: { files: [file] } });
    expect(onFiles).toHaveBeenCalledWith([file]);
  });

  it("adds dropped files and shows the drag target", () => {
    const onFiles = vi.fn();
    render(<TextComposer value="" onChange={() => undefined} files={[]} onFiles={onFiles} placeholder="Drop here" />);
    const file = new File(["document"], "acceptance.txt", { type: "text/plain" });
    const dataTransfer = { types: ["Files"], files: [file], dropEffect: "none" };
    const editor = screen.getByPlaceholderText("Drop here");

    fireEvent.dragEnter(editor, { dataTransfer });
    expect(screen.getByText("Відпустіть файли")).toBeVisible();
    fireEvent.drop(editor, { dataTransfer });

    expect(onFiles).toHaveBeenCalledWith([file]);
    expect(screen.queryByText("Відпустіть файли")).not.toBeInTheDocument();
  });

  it("adds pasted images but leaves ordinary text paste alone", () => {
    const onFiles = vi.fn();
    render(<TextComposer value="" onChange={() => undefined} files={[]} onFiles={onFiles} placeholder="Paste here" />);
    const image = new File(["image"], "screenshot.png", { type: "image/png" });
    const editor = screen.getByPlaceholderText("Paste here");

    const imagePasteAllowed = fireEvent.paste(editor, {
      clipboardData: { items: [{ kind: "file", type: image.type, getAsFile: () => image }], files: [image] },
    });
    expect(imagePasteAllowed).toBe(false);
    expect(onFiles).toHaveBeenCalledWith([image]);

    onFiles.mockClear();
    const textPasteAllowed = fireEvent.paste(editor, {
      clipboardData: { items: [{ kind: "string", type: "text/plain", getAsFile: () => null }], files: [] },
    });
    expect(textPasteAllowed).toBe(true);
    expect(onFiles).not.toHaveBeenCalled();
  });

  it("rejects files larger than the upload limit", () => {
    const onFiles = vi.fn();
    const onError = vi.fn();
    render(<TextComposer value="" onChange={() => undefined} files={[]} onFiles={onFiles} onError={onError} />);
    const oversized = new File([new Uint8Array(MAX_ATTACHMENT_BYTES + 1)], "too-large.zip");
    fireEvent.change(screen.getByLabelText("Відкрити файли з диска"), { target: { files: [oversized] } });
    expect(onFiles).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("максимум 10 MB"));
  });
});
