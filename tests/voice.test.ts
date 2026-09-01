import { describe, expect, it } from "vitest";
import { fallbackTitle, interpretVoiceCommand, parseEditorVoiceInput, parseVoiceCommand } from "@/lib/voice";
import { DEFAULT_VOICE_COMMANDS } from "@/lib/voice-command-settings";

describe("voice command fallback", () => {
  it.each([
    ["Відкрий новий таск", { action: "open_create" }],
    ["Створи нову задачу", { action: "open_create" }],
    ["Set title to Fix broken login", { action: "set_title", value: "Fix broken login" }],
    ["Додай коментар перевірено на staging", { action: "append_comment", value: "перевірено на staging" }],
    ["Додай в опис критерії приймання", { action: "append_body", value: "критерії приймання" }],
    ["Додай скріншот", { action: "attach_clipboard_image" }],
    ["Attach image from clipboard", { action: "attach_clipboard_image" }],
    ["Знайди задачі авторизація", { action: "search", value: "авторизація" }],
    ["Опублікуй задачу", { action: "submit_issue" }],
    ["Онови дошку з задачами", { action: "refresh" }],
  ])("routes %s", (spoken, command) => {
    expect(parseVoiceCommand(spoken)).toEqual(command);
  });

  it("does not turn unknown speech into a write action", () => {
    expect(parseVoiceCommand("можливо колись треба подумати про це")).toEqual({
      action: "unknown",
      value: "можливо колись треба подумати про це",
    });
  });

  it.each([
    ["Редагувати задачу 432.", { action: "open_issue", issueNumber: 432 }],
    ["Правити таск #18", { action: "open_issue", issueNumber: 18 }],
    ["Праивти ішю 19", { action: "open_issue", issueNumber: 19 }],
    ["Змінити issue 24", { action: "open_issue", issueNumber: 24 }],
    ["Edit task 77", { action: "open_issue", issueNumber: 77 }],
    ["Видалити задачу 432", { action: "delete_issue", issueNumber: 432 }],
    ["Знищити таск 12", { action: "delete_issue", issueNumber: 12 }],
    ["Delete issue #7", { action: "delete_issue", issueNumber: 7 }],
    ["Remove task 8", { action: "delete_issue", issueNumber: 8 }],
    ["Перенести задачу 432 з In progress в колонку Review", { action: "move_issue", issueNumber: 432, sourceStatus: "In progress", targetStatus: "Review" }],
    ["Move issue 91 from In review to column Done", { action: "move_issue", issueNumber: 91, sourceStatus: "In review", targetStatus: "Done" }],
    ["Move task 5 to Backlog", { action: "move_issue", issueNumber: 5, targetStatus: "Backlog" }],
  ])("routes issue management command %s", (spoken, command) => {
    expect(parseVoiceCommand(spoken)).toEqual(command);
  });

  it("uses editable command aliases", () => {
    const configured = { ...DEFAULT_VOICE_COMMANDS, editIssue: ["підправити"] };
    expect(parseVoiceCommand("Підправити таск 432", configured)).toEqual({ action: "open_issue", issueNumber: 432 });
    expect(parseVoiceCommand("Редагувати таск 432", configured)).toEqual({ action: "unknown", value: "Редагувати таск 432" });
  });

  it("routes browser-configured aliases from command context", async () => {
    const voiceCommands = { ...DEFAULT_VOICE_COMMANDS, moveIssue: ["перекинь"] };
    await expect(interpretVoiceCommand("Перекинь ішю 432 з Todo в Review", { voiceCommands })).resolves.toEqual({
      action: "move_issue",
      issueNumber: 432,
      sourceStatus: "Todo",
      targetStatus: "Review",
    });
  });
});

describe("fallback issue title", () => {
  it("uses the first meaningful markdown line", () => {
    expect(fallbackTitle("\n## Додати OAuth авторизацію\n\nДеталі")).toBe("Додати OAuth авторизацію");
  });

  it("limits generated titles", () => {
    const title = fallbackTitle("one two three four five six seven eight nine ten eleven twelve thirteen fourteen");
    expect(title.split(" ")).toHaveLength(12);
  });
});

describe("voice input while the issue editor is open", () => {
  it.each([
    ["Збережи задачу", { action: "submit_issue" }],
    ["Додай цей task", { action: "submit_issue" }],
    ["Close and save this issue", { action: "submit_issue" }],
    ["Збережи і закрий задачу", { action: "submit_issue" }],
    ["Закрити та додати завдання", { action: "submit_issue" }],
    ["Скасуй задачу", { action: "close_panel" }],
    ["Відміни створення задачі", { action: "close_panel" }],
    ["Відмінити завдання", { action: "close_panel" }],
    ["Close without saving", { action: "close_panel" }],
    ["Set title to Fix mixed auth", { action: "set_title", value: "Fix mixed auth" }],
    ["Додати скриншот", { action: "attach_clipboard_image" }],
    ["Встав знімок екрана з буфера обміну", { action: "attach_clipboard_image" }],
    ["Прикріпи картинку з clipboard", { action: "attach_clipboard_image" }],
    ["Paste the screenshot from the clipboard", { action: "attach_clipboard_image" }],
    ["Add clipboard image", { action: "attach_clipboard_image" }],
    ["Додай скрін", { action: "attach_clipboard_image" }],
    ["Встав скриншот", { action: "attach_clipboard_image" }],
    ["Долучи знімок", { action: "attach_clipboard_image" }],
    ["Додай картинку", { action: "attach_clipboard_image" }],
  ])("routes the explicit editor command %s", (spoken, command) => {
    expect(parseEditorVoiceInput(spoken)).toEqual(command);
  });

  it.each([
    "Потрібно додати валідацію форми",
    "Add retry handling for the GitHub request",
    "Перевірити login flow після оновлення token",
    "Додай можливість вибрати organization",
  ])("appends ordinary dictation to the description: %s", (spoken) => {
    expect(parseEditorVoiceInput(spoken)).toEqual({ action: "append_body", value: spoken });
  });

  it.each([
    [
      "Потрібно виправити форму, встав скріншот, і перевірити mobile layout",
      "Потрібно виправити форму і перевірити mobile layout",
    ],
    [
      "Онови документацію і додай скрін з буфера обміну потім запусти тести",
      "Онови документацію і потім запусти тести",
    ],
    [
      "Implement the login flow, attach screenshot, and cover mobile",
      "Implement the login flow and cover mobile",
    ],
    [
      "Опиши помилку, встав скрін, потім вкажи браузер",
      "Опиши помилку потім вкажи браузер",
    ],
    [
      "Перевір темну тему, долучи знімок, і створи regression test",
      "Перевір темну тему і створи regression test",
    ],
    [
      "Відтвори проблему, додай картинку з буфера обміну, і запиши expected result",
      "Відтвори проблему і запиши expected result",
    ],
  ])("keeps surrounding dictation while routing an embedded screenshot command: %s", (spoken, value) => {
    expect(parseEditorVoiceInput(spoken)).toEqual({ action: "attach_clipboard_image", value });
  });

  it("does not treat an infinitive product requirement as an embedded screenshot command", () => {
    const spoken = "Потрібно додати картинку профілю на сторінку користувача";
    expect(parseEditorVoiceInput(spoken)).toEqual({ action: "append_body", value: spoken });
  });

  it("uses deterministic dictation routing when the editor context is active", async () => {
    await expect(interpretVoiceCommand("Implement token refresh після login", { editorOpen: true })).resolves.toEqual({
      action: "append_body",
      value: "Implement token refresh після login",
    });
  });

  it("routes ordinary dictation to the active comment composer", async () => {
    const spoken = "Перевірив виправлення на staging";
    expect(parseEditorVoiceInput(spoken, undefined, "comment")).toEqual({
      action: "append_comment",
      value: spoken,
    });
    await expect(interpretVoiceCommand(spoken, { editorOpen: true, editorTarget: "comment" })).resolves.toEqual({
      action: "append_comment",
      value: spoken,
    });
  });

  it("keeps an explicit description command targeted at the body from the comments tab", () => {
    expect(parseEditorVoiceInput("Додай в опис перевірку mobile layout", undefined, "comment")).toEqual({
      action: "append_body",
      value: "перевірку mobile layout",
    });
  });

  it.each([
    ["Видалити задачу", { action: "delete_issue" }],
    ["Перенести з Todo в колонку In progress", { action: "move_issue", sourceStatus: "Todo", targetStatus: "In progress" }],
  ])("routes current editor management command %s", (spoken, command) => {
    expect(parseEditorVoiceInput(spoken)).toEqual(command);
  });
});
