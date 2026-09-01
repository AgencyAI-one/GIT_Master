import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }, testInfo) => {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `192.0.2.${testInfo.workerIndex + 1}` });
  await page.goto("/login");
});

test("rejects a wrong password", async ({ page }) => {
  await page.getByLabel("Пароль").fill("wrong");
  await page.getByRole("button", { name: "Відкрити workspace" }).click();
  await expect(page.getByText("Incorrect password", { exact: true })).toBeVisible();
});

test("opens the demo workspace and connection flow", async ({ page }) => {
  await page.getByLabel("Пароль").fill("playwright-password");
  await page.getByRole("button", { name: "Відкрити workspace" }).click();
  await expect(page).toHaveURL(/\/workspace$/);
  await expect(page.getByRole("heading", { name: "Product board" })).toBeVisible();
  await expect(page.getByText("Додати голосове створення issues українською")).toBeVisible();
  await page.getByRole("button", { name: /New issue/i }).click();
  await expect(page.getByRole("dialog", { name: "Підключення GitHub" })).toBeVisible();
  await expect(page.getByText("Fine-grained personal access token")).toBeVisible();
});

test("opens a new issue with the keyboard shortcut", async ({ page }) => {
  await page.getByLabel("Пароль").fill("playwright-password");
  await page.getByRole("button", { name: "Відкрити workspace" }).click();
  await page.getByRole("button", { name: "New issue" }).focus();
  await page.keyboard.press("Alt+n");
  await expect(page.getByRole("dialog", { name: "Підключення GitHub" })).toBeVisible();
});

test("configures and persists keyboard shortcuts", async ({ page, isMobile }) => {
  await page.getByLabel("Пароль").fill("playwright-password");
  await page.getByRole("button", { name: "Відкрити workspace" }).click();
  if (isMobile) await page.getByRole("button", { name: "Меню" }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();

  const dialog = page.getByRole("dialog", { name: "Налаштування" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: /Змінити комбінацію: Голосова команда/ }).click();
  await page.keyboard.press("Control+Shift+Space");
  await expect(dialog.getByRole("button", { name: /Змінити комбінацію: Голосова команда/ })).toHaveText("Ctrl+Shift+Space");
  await dialog.getByLabel("Редагувати issue").fill("підправити, edit");
  await dialog.getByLabel("Видалити issue").fill("прибрати, remove");
  await dialog.getByRole("button", { name: "Зберегти" }).click();

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("git-master-shortcuts") || "{}"));
  expect(stored.voice).toEqual({ code: "Space", alt: false, ctrl: true, shift: true, meta: false });
  const storedCommands = await page.evaluate(() => JSON.parse(localStorage.getItem("git-master-voice-commands") || "{}"));
  expect(storedCommands.editIssue).toEqual(["підправити", "edit"]);
  expect(storedCommands.deleteIssue).toEqual(["прибрати", "remove"]);
});

test("uses the voice shortcut as push-to-talk and latches on a double press", async ({ page }) => {
  await page.addInitScript(() => {
    class FakeMediaRecorder {
      static isTypeSupported() { return true; }
      state = "inactive";
      mimeType = "audio/webm";
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      start() { this.state = "recording"; }
      stop() {
        this.state = "inactive";
        this.ondataavailable?.({ data: new Blob(["voice"]) });
        this.onstop?.();
      }
    }
    const stream = { getTracks: () => [{ stop() {} }] };
    Object.defineProperty(window, "MediaRecorder", { configurable: true, value: FakeMediaRecorder });
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: async () => stream } });
  });
  await page.reload();
  let transcriptNumber = 0;
  await page.route("**/api/voice/transcribe", async (route) => route.fulfill({
    json: { text: ++transcriptNumber === 1 ? "перша команда" : "друга команда" },
  }));
  await page.route("**/api/voice/command", async (route) => route.fulfill({ json: { command: { action: "unknown" } } }));

  await page.getByLabel("Пароль").fill("playwright-password");
  await page.getByRole("button", { name: "Відкрити workspace" }).click();
  await page.getByRole("button", { name: "Голосова команда" }).focus();

  await page.keyboard.down("Alt");
  await page.keyboard.press("Tab");
  await page.keyboard.up("Alt");
  await page.waitForTimeout(350);
  expect(transcriptNumber).toBe(0);

  await page.keyboard.down("Alt");
  await expect(page.getByText("Слухаю…")).toBeVisible();
  await page.keyboard.up("Alt");
  await expect(page.getByText("перша команда")).toBeVisible();

  await page.keyboard.press("Alt");
  await page.waitForTimeout(50);
  await page.keyboard.press("Alt");
  await expect(page.getByText("Запис зафіксовано")).toBeVisible();
  await page.keyboard.press("Alt");
  await expect(page.getByText("друга команда")).toBeVisible();
});

test("dictates multiple issue fragments and saves or cancels by voice", async ({ page }) => {
  const connectionId = "voice-editor-connection";
  const repository = "acme/voice-app";
  const transcripts = [
    "Відкрий нову задачу",
    "Потрібно додати українську валідацію",
    "Handle English error messages",
    "Додай критерії доступності, встав скріншот, і перевір mobile layout",
    "Збережи задачу",
    "Open a new issue",
    "Temporary draft",
    "Cancel issue",
  ];
  let transcriptIndex = 0;
  const editorContexts: boolean[] = [];
  const createdBodies: string[] = [];
  let attachmentUploads = 0;

  await page.addInitScript(({ connectionId, repository }) => {
    localStorage.setItem("git-master-connection", connectionId);
    localStorage.setItem(`git-master-repository:${connectionId}`, repository);
    class FakeMediaRecorder {
      static isTypeSupported() { return true; }
      state = "inactive";
      mimeType = "audio/webm";
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      start() { this.state = "recording"; }
      stop() {
        this.state = "inactive";
        this.ondataavailable?.({ data: new Blob(["voice"]) });
        this.onstop?.();
      }
    }
    const stream = { getTracks: () => [{ stop() {} }] };
    Object.defineProperty(window, "MediaRecorder", { configurable: true, value: FakeMediaRecorder });
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: async () => stream } });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        read: async () => [{
          types: ["image/png"],
          getType: async () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }),
        }],
      },
    });
  }, { connectionId, repository });
  await page.route("**/api/connections", async (route) => route.fulfill({
    json: { connections: [{ id: connectionId, name: "Voice App", scopeType: "repository", owner: "acme", repository: "voice-app", login: "dev", createdAt: "2026-09-01T00:00:00Z" }] },
  }));
  await page.route("**/api/github/repositories?*", async (route) => route.fulfill({
    json: { repositories: [{ id: 1, nodeId: "R_VOICE", name: "voice-app", fullName: repository, owner: "acme", private: true, archived: false, defaultBranch: "main", url: "https://github.test/acme/voice-app" }] },
  }));
  await page.route("**/api/github/projects?*", async (route) => route.fulfill({ json: { projects: [] } }));
  await page.route("**/api/github/board?*", async (route) => route.fulfill({
    json: { board: { source: "repository", statuses: [{ id: "todo", name: "Todo" }, { id: "done", name: "Done" }], issues: [] } },
  }));
  await page.route("**/api/voice/transcribe", async (route) => route.fulfill({ json: { text: transcripts[transcriptIndex++] } }));
  await page.route("**/api/voice/command", async (route) => {
    const payload = route.request().postDataJSON() as { text: string; context: { editorOpen?: boolean } };
    editorContexts.push(payload.context.editorOpen === true);
    let command: { action: string; value?: string };
    if (/відкрий|open a new/i.test(payload.text)) command = { action: "open_create" };
    else if (/скріншот/i.test(payload.text)) command = { action: "attach_clipboard_image", value: "Додай критерії доступності і перевір mobile layout" };
    else if (/збережи/i.test(payload.text)) command = { action: "submit_issue" };
    else if (/cancel/i.test(payload.text)) command = { action: "close_panel" };
    else command = { action: "append_body", value: payload.text };
    await route.fulfill({ json: { command } });
  });
  await page.route("**/api/voice/title", async (route) => route.fulfill({ json: { title: "Bilingual voice task" } }));
  await page.route("**/api/github/issues", async (route) => {
    const payload = route.request().postDataJSON() as { title: string; body: string };
    createdBodies.push(payload.body);
    await route.fulfill({ status: 201, json: { issue: {
      id: "VOICE_1", nodeId: "VOICE_1", number: 7, title: payload.title, body: payload.body, state: "open",
      status: "Todo", url: "https://github.test/acme/voice-app/issues/7", repository, labels: [], assignees: [],
      commentCount: 0, updatedAt: "2026-09-01T03:00:00Z",
    }, warnings: [] } });
  });
  await page.route("**/api/github/attachments", async (route) => {
    attachmentUploads += 1;
    await route.fulfill({ status: 201, json: { attachment: { markdown: "![clipboard screenshot](https://github.test/clipboard.png)" } } });
  });
  await page.route("**/api/github/issues/7", async (route) => {
    const payload = route.request().postDataJSON() as { body: string };
    await route.fulfill({ json: { issue: {
      id: "VOICE_1", nodeId: "VOICE_1", number: 7, title: "Bilingual voice task", body: payload.body, state: "open",
      status: "Todo", url: "https://github.test/acme/voice-app/issues/7", repository, labels: [], assignees: [],
      commentCount: 0, updatedAt: "2026-09-01T03:00:00Z",
    } } });
  });

  await page.goto("/login");
  await page.getByLabel("Пароль").fill("playwright-password");
  await page.getByRole("button", { name: "Відкрити workspace" }).click();
  await page.getByRole("button", { name: "Голосова команда" }).focus();
  const speak = async () => {
    await page.keyboard.down("Alt");
    await expect(page.getByText("Слухаю…")).toBeVisible();
    await page.waitForTimeout(320);
    await page.keyboard.up("Alt");
  };

  await speak();
  await expect.poll(() => transcriptIndex).toBe(1);
  const drawer = page.getByRole("dialog", { name: "Нове issue" });
  await expect(drawer).toBeVisible();

  const description = page.getByPlaceholder("Опишіть очікуваний результат, контекст і критерії готовності…");
  await speak();
  await expect(description).toHaveValue("Потрібно додати українську валідацію");
  await speak();
  await expect(description).toHaveValue("Потрібно додати українську валідацію\n\nHandle English error messages");
  await speak();
  await expect(drawer.getByText(/clipboard-\d+-1\.png/)).toBeVisible();
  await expect(page.getByText("Скріншот із clipboard додано до задачі")).toBeVisible();
  await expect(description).toHaveValue("Потрібно додати українську валідацію\n\nHandle English error messages\n\nДодай критерії доступності і перевір mobile layout");
  await speak();
  await expect(drawer).toHaveCount(0);
  await expect(page.getByText("Bilingual voice task")).toBeVisible();
  expect(createdBodies).toEqual(["Потрібно додати українську валідацію\n\nHandle English error messages\n\nДодай критерії доступності і перевір mobile layout"]);
  expect(attachmentUploads).toBe(1);

  await speak();
  await expect(drawer).toBeVisible();
  await speak();
  await expect(description).toHaveValue("Temporary draft");
  await speak();
  await expect(drawer).toHaveCount(0);
  await expect(page.getByText("Створення issue скасовано")).toBeVisible();
  expect(createdBodies).toHaveLength(1);
  expect(editorContexts).toEqual([false, true, true, true, true, false, true, true]);
});

test("edits, moves, and requests deletion of a numbered issue by voice", async ({ page }) => {
  const connectionId = "voice-manage-connection";
  const repository = "acme/voice-board";
  const issue = {
    id: "432", nodeId: "I_432", number: 432, title: "Manage me by voice", body: "Existing body", state: "open" as const,
    status: "Todo", url: "https://github.test/acme/voice-board/issues/432", repository, labels: [], assignees: [],
    commentCount: 0, updatedAt: "2026-09-01T00:00:00Z",
  };
  const transcripts = [
    "Редагувати задачу 432.",
    "Move issue 432 from Todo to Review",
    "Знищити ішю 432",
  ];
  let transcriptIndex = 0;
  const statusUpdates: Array<{ issueNumber: number; status: string }> = [];
  let deleted = false;

  await page.addInitScript(({ connectionId, repository }) => {
    localStorage.setItem("git-master-connection", connectionId);
    localStorage.setItem(`git-master-repository:${connectionId}`, repository);
    class FakeMediaRecorder {
      static isTypeSupported() { return true; }
      state = "inactive";
      mimeType = "audio/webm";
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      start() { this.state = "recording"; }
      stop() {
        this.state = "inactive";
        this.ondataavailable?.({ data: new Blob(["voice"]) });
        this.onstop?.();
      }
    }
    const stream = { getTracks: () => [{ stop() {} }] };
    Object.defineProperty(window, "MediaRecorder", { configurable: true, value: FakeMediaRecorder });
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: async () => stream } });
  }, { connectionId, repository });
  await page.route("**/api/connections", async (route) => route.fulfill({
    json: { connections: [{ id: connectionId, name: "Voice Board", scopeType: "repository", owner: "acme", repository: "voice-board", login: "dev", createdAt: "2026-09-01T00:00:00Z" }] },
  }));
  await page.route("**/api/github/repositories?*", async (route) => route.fulfill({
    json: { repositories: [{ id: 1, nodeId: "R_VOICE_BOARD", name: "voice-board", fullName: repository, owner: "acme", private: true, archived: false, defaultBranch: "main", url: "https://github.test/acme/voice-board" }] },
  }));
  await page.route("**/api/github/projects?*", async (route) => route.fulfill({ json: { projects: [] } }));
  await page.route("**/api/github/board?*", async (route) => route.fulfill({
    json: { board: { source: "repository", statuses: [{ id: "todo", name: "Todo" }, { id: "review", name: "Review" }, { id: "done", name: "Done" }], issues: [issue] } },
  }));
  await page.route("**/api/voice/transcribe", async (route) => route.fulfill({ json: { text: transcripts[transcriptIndex++] } }));
  await page.route("**/api/github/status", async (route) => {
    statusUpdates.push(route.request().postDataJSON() as { issueNumber: number; status: string });
    await route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/github/issues/432", async (route) => {
    if (route.request().method() === "DELETE") {
      deleted = true;
      await route.fulfill({ json: { deleted: true, number: 432 } });
      return;
    }
    await route.fulfill({ json: { issue } });
  });

  await page.goto("/login");
  await page.getByLabel("Пароль").fill("playwright-password");
  await page.getByRole("button", { name: "Відкрити workspace" }).click();
  await expect(page.getByText("Manage me by voice")).toBeVisible();

  await page.keyboard.press("Alt");
  const drawer = page.getByRole("dialog", { name: "Issue 432" });
  await expect(drawer).toBeVisible();
  await drawer.getByRole("button", { name: "Закрити", exact: true }).click();

  await page.keyboard.press("Alt");
  const reviewColumn = page.getByRole("region", { name: "Review column" });
  await expect(reviewColumn.getByText("Manage me by voice")).toBeVisible();
  expect(statusUpdates).toMatchObject([{ issueNumber: 432, status: "Review" }]);

  await expect(page.getByText("Issue #432 перенесено в «Review»")).toBeVisible();
  await page.waitForTimeout(500);
  await page.keyboard.press("Alt");
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Так, видалити" })).toBeVisible();
  expect(deleted).toBe(false);
  await drawer.getByRole("button", { name: "Так, видалити" }).click();
  await expect(page.getByText("Manage me by voice")).toHaveCount(0);
  expect(deleted).toBe(true);
});

test("shows a created issue immediately, edits a comment, and deletes the issue", async ({ page }) => {
  const connectionId = "write-connection";
  const repository = "acme/web";
  const existingIssue = {
    id: "1", nodeId: "I_1", number: 1, title: "Existing task", body: "Existing body", state: "open" as const,
    status: "Todo", url: "https://github.test/acme/web/issues/1", repository, labels: [], assignees: [],
    commentCount: 1, updatedAt: "2026-09-01T00:00:00Z",
  };
  const createdIssue = {
    id: "2", nodeId: "I_2", number: 2, title: "Created without refresh", body: "", state: "open" as const,
    status: "Todo", url: "https://github.test/acme/web/issues/2", repository, labels: [], assignees: [],
    commentCount: 0, updatedAt: "2026-09-01T01:00:00Z",
  };
  let comment = {
    id: 91, body: "Original comment", createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z",
    url: "https://github.test/comment/91", author: { login: "dev", avatarUrl: "https://github.test/dev.png" },
  };
  const voiceTranscripts = ["Voice note for the new comment", "Additional edit dictation"];
  const voiceTargets: unknown[] = [];
  let voiceTranscriptIndex = 0;

  await page.addInitScript(({ connectionId, repository }) => {
    localStorage.setItem("git-master-connection", connectionId);
    localStorage.setItem(`git-master-repository:${connectionId}`, repository);
    class FakeMediaRecorder {
      static isTypeSupported() { return true; }
      state = "inactive";
      mimeType = "audio/webm";
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      start() { this.state = "recording"; }
      stop() {
        this.state = "inactive";
        this.ondataavailable?.({ data: new Blob(["voice"]) });
        this.onstop?.();
      }
    }
    const stream = { getTracks: () => [{ stop() {} }] };
    Object.defineProperty(window, "MediaRecorder", { configurable: true, value: FakeMediaRecorder });
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: async () => stream } });
  }, { connectionId, repository });
  await page.route("**/api/connections", async (route) => route.fulfill({
    json: { connections: [{ id: connectionId, name: "Acme", scopeType: "repository", owner: "acme", repository: "web", login: "dev", createdAt: "2026-09-01T00:00:00Z" }] },
  }));
  await page.route("**/api/github/repositories?*", async (route) => route.fulfill({
    json: { repositories: [{ id: 1, nodeId: "R_1", name: "web", fullName: repository, owner: "acme", private: true, archived: false, defaultBranch: "main", url: "https://github.test/acme/web" }] },
  }));
  await page.route("**/api/github/projects?*", async (route) => route.fulfill({ json: { projects: [] } }));
  await page.route("**/api/github/board?*", async (route) => route.fulfill({
    json: { board: { source: "repository", statuses: [{ id: "todo", name: "Todo" }, { id: "in-progress", name: "In progress" }, { id: "done", name: "Done" }], issues: [existingIssue] } },
  }));
  await page.route("**/api/voice/transcribe", async (route) => route.fulfill({
    json: { text: voiceTranscripts[voiceTranscriptIndex++] },
  }));
  await page.route("**/api/voice/command", async (route) => {
    const payload = route.request().postDataJSON() as { text: string; context: { editorTarget?: unknown } };
    voiceTargets.push(payload.context.editorTarget);
    await route.fulfill({ json: { command: { action: "append_comment", value: payload.text } } });
  });
  await page.route("**/api/github/issues", async (route) => route.fulfill({ status: 201, json: { issue: createdIssue, warnings: [] } }));
  await page.route("**/api/github/issues/1/comments?*", async (route) => route.fulfill({ json: { comments: [comment] } }));
  await page.route("**/api/github/issues/1/comments/91", async (route) => {
    const body = route.request().postDataJSON() as { body: string };
    comment = { ...comment, body: body.body, updatedAt: "2026-09-01T02:00:00Z" };
    await route.fulfill({ json: { comment } });
  });
  await page.route("**/api/github/issues/1", async (route) => route.fulfill({ json: { deleted: true, number: 1 } }));

  await page.goto("/login");
  await page.getByLabel("Пароль").fill("playwright-password");
  await page.getByRole("button", { name: "Відкрити workspace" }).click();
  await expect(page.getByText("Existing task")).toBeVisible();

  await page.getByRole("button", { name: "New issue" }).click();
  await page.getByLabel("Назва").fill("Created without refresh");
  await page.getByRole("button", { name: "Створити issue" }).click();
  await expect(page.getByText("Created without refresh")).toBeVisible();

  await page.getByRole("button", { name: /Existing task/ }).click();
  const drawer = page.getByRole("dialog", { name: "Issue 1" });
  await drawer.getByLabel("Відкрити файли з диска").setInputFiles({
    name: "from-disk.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("selected from disk"),
  });
  await expect(drawer.getByText("from-disk.txt")).toBeVisible();

  const description = drawer.getByPlaceholder("Опишіть очікуваний результат, контекст і критерії готовності…");
  const droppedFile = await page.evaluateHandle(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(["dropped"], "dragged-file.txt", { type: "text/plain" }));
    return transfer;
  });
  await description.dispatchEvent("dragenter", { dataTransfer: droppedFile });
  await expect(drawer.getByText("Відпустіть файли")).toBeVisible();
  await description.dispatchEvent("drop", { dataTransfer: droppedFile });
  await expect(drawer.getByText("dragged-file.txt")).toBeVisible();

  await page.getByRole("button", { name: /Коментарі/ }).click();
  await expect(page.getByText("Original comment")).toBeVisible();
  const newComment = drawer.getByPlaceholder("Додайте коментар текстом або голосом…");
  const speak = async () => {
    await page.keyboard.down("Alt");
    await expect(page.getByText("Слухаю…")).toBeVisible();
    await page.waitForTimeout(320);
    await page.keyboard.up("Alt");
  };
  await speak();
  await expect(newComment).toHaveValue("Voice note for the new comment");
  expect(voiceTargets).toEqual(["comment"]);
  await newComment.evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array([137, 80, 78, 71])], "clipboard-shot.png", { type: "image/png" }));
    element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: transfer }));
  });
  await expect(drawer.getByText("clipboard-shot.png")).toBeVisible();

  await page.getByRole("button", { name: "Редагувати коментар 91" }).click();
  const editedComment = drawer.getByPlaceholder("Відредагуйте коментар…");
  await speak();
  await expect(editedComment).toHaveValue("Original comment\n\nAdditional edit dictation");
  await expect(newComment).toHaveValue("Voice note for the new comment");
  expect(voiceTargets).toEqual(["comment", "comment"]);
  const editedCommentComposer = editedComment.locator("..");
  const editDrop = await page.evaluateHandle(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(["edit attachment"], "edit-drop.txt", { type: "text/plain" }));
    return transfer;
  });
  await editedComment.dispatchEvent("drop", { dataTransfer: editDrop });
  await expect(editedCommentComposer.getByText("edit-drop.txt")).toBeVisible();
  await editedCommentComposer.getByRole("button", { name: "Видалити edit-drop.txt" }).click();
  await editedComment.fill("Updated comment");
  await page.getByRole("button", { name: "Зберегти" }).click();
  await expect(page.getByText("Updated comment")).toBeVisible();

  await page.getByRole("button", { name: "Деталі" }).click();
  await expect(description).toHaveValue("Existing body");
  await page.getByRole("button", { name: "Видалити", exact: true }).click();
  await page.getByRole("button", { name: "Так, видалити" }).click();
  await expect(page.getByText("Existing task")).toHaveCount(0);
  await expect(page.getByText("Created without refresh")).toBeVisible();
});

test("demo cards can reorder within a column and move between columns", async ({ page, isMobile }) => {
  test.skip(Boolean(isMobile), "Native HTML drag-and-drop is a desktop interaction");
  await page.getByLabel("Пароль").fill("playwright-password");
  await page.getByRole("button", { name: "Відкрити workspace" }).click();
  const todoColumn = page.getByRole("region", { name: "Todo column" });
  const card = todoColumn.getByRole("button", { name: /Command palette для швидкої навігації/ });
  const firstCard = todoColumn.getByRole("button", { name: /Підключення GitHub organization/ });
  const firstCardBounds = await firstCard.boundingBox();
  expect(firstCardBounds).not.toBeNull();

  const reorderTransfer = await page.evaluateHandle(() => new DataTransfer());
  await card.dispatchEvent("dragstart", { dataTransfer: reorderTransfer });
  await firstCard.dispatchEvent("dragover", { dataTransfer: reorderTransfer, clientY: firstCardBounds!.y + 1 });
  await firstCard.dispatchEvent("drop", { dataTransfer: reorderTransfer, clientY: firstCardBounds!.y + 1 });
  await expect.poll(async () => todoColumn.locator("h3").allTextContents()).toEqual([
    "Command palette для швидкої навігації",
    "Підключення GitHub organization з вибором репозиторіїв",
  ]);

  const reviewColumn = page.getByRole("region", { name: "Review column" });
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await card.dispatchEvent("dragstart", { dataTransfer });
  await reviewColumn.dispatchEvent("dragover", { dataTransfer });
  await reviewColumn.dispatchEvent("drop", { dataTransfer });
  await expect(reviewColumn.getByText("Command palette для швидкої навігації")).toBeVisible();
});

test("a slower repository response cannot overwrite the selected Project board", async ({ page, isMobile }) => {
  const connectionId = "race-connection";
  const repository = "acme/web";
  const projectId = "PVT_race";
  let statusPayload: Record<string, unknown> | undefined;
  await page.addInitScript(({ connectionId, repository, projectId }) => {
    localStorage.setItem("git-master-connection", connectionId);
    localStorage.setItem(`git-master-repository:${connectionId}`, repository);
    localStorage.setItem(`git-master-project:${repository}`, projectId);
  }, { connectionId, repository, projectId });

  await page.route("**/api/connections", async (route) => route.fulfill({
    json: { connections: [{ id: connectionId, name: "Acme", scopeType: "organization", owner: "acme", login: "dev", createdAt: "2026-09-01T00:00:00Z" }] },
  }));
  await page.route("**/api/github/repositories?*", async (route) => route.fulfill({
    json: { repositories: [{ id: 1, nodeId: "R_1", name: "web", fullName: repository, owner: "acme", private: true, archived: false, defaultBranch: "main", url: "https://github.test/acme/web" }] },
  }));
  await page.route("**/api/github/projects?*", async (route) => route.fulfill({
    json: { projects: [{ id: projectId, number: 1, title: "Acme Project", url: "https://github.test/project", closed: false }] },
  }));
  await page.route("**/api/github/board?*", async (route) => {
    const selectedProject = new URL(route.request().url()).searchParams.has("projectId");
    if (!selectedProject) await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fulfill({ json: { board: selectedProject ? {
      source: "project", projectId, statusFieldId: "STATUS",
      statuses: [{ id: "PROGRESS", name: "In progress" }, { id: "REVIEW", name: "In review" }, { id: "DONE", name: "Done" }],
      issues: [
        { id: "correct", nodeId: "I_1", itemId: "ITEM_1", number: 1, title: "Correct review issue", body: "", state: "open", status: "In review", statusOptionId: "REVIEW", url: "#", repository, labels: [], assignees: [], commentCount: 0, updatedAt: "2026-09-01T00:00:00Z" },
        { id: "second", nodeId: "I_3", itemId: "ITEM_2", number: 3, title: "Second review issue", body: "", state: "open", status: "In review", statusOptionId: "REVIEW", url: "#", repository, labels: [], assignees: [], commentCount: 0, updatedAt: "2026-09-01T00:00:00Z" },
      ],
    } : {
      source: "repository",
      statuses: [{ id: "in-progress", name: "In progress" }, { id: "review", name: "Review" }, { id: "done", name: "Done" }],
      issues: [{ id: "wrong", nodeId: "I_2", number: 2, title: "Wrong fallback issue", body: "", state: "open", status: "In progress", url: "#", repository, labels: [], assignees: [], commentCount: 0, updatedAt: "2026-09-01T00:00:00Z" }],
    } } });
  });
  await page.route("**/api/github/status", async (route) => {
    statusPayload = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ json: { ok: true } });
  });

  await page.goto("/login");
  await page.getByLabel("Пароль").fill("playwright-password");
  await page.getByRole("button", { name: "Відкрити workspace" }).click();
  await expect(page.getByText("Correct review issue")).toBeVisible();
  await page.waitForTimeout(900);
  await expect(page.getByText("Correct review issue")).toBeVisible();
  await expect(page.getByText("Wrong fallback issue")).toHaveCount(0);
  await expect(page.getByText("GitHub Project", { exact: true })).toBeVisible();

  if (!isMobile) {
    const reviewColumn = page.getByRole("region", { name: "In review column" });
    const first = reviewColumn.getByRole("button", { name: /Correct review issue/ });
    const second = reviewColumn.getByRole("button", { name: /Second review issue/ });
    const firstBounds = await first.boundingBox();
    expect(firstBounds).not.toBeNull();
    const transfer = await page.evaluateHandle(() => new DataTransfer());
    await second.dispatchEvent("dragstart", { dataTransfer: transfer });
    await first.dispatchEvent("dragover", { dataTransfer: transfer, clientY: firstBounds!.y + 1 });
    await first.dispatchEvent("drop", { dataTransfer: transfer, clientY: firstBounds!.y + 1 });
    await expect.poll(async () => reviewColumn.locator("h3").allTextContents()).toEqual(["Second review issue", "Correct review issue"]);
    await expect.poll(() => statusPayload).toMatchObject({
      projectId,
      itemId: "ITEM_2",
      fieldId: "STATUS",
      optionId: "REVIEW",
      afterItemId: null,
    });
  }
});

test("refreshes a Project board after a signed GitHub webhook without polling", async ({ page, request, isMobile }) => {
  const client = isMobile ? "mobile" : "desktop";
  const connectionId = `live-connection-${client}`;
  const repository = `acme/live-app-${client}`;
  const projectId = `PVT_live_${client}`;
  let projectBoardReads = 0;

  await page.addInitScript(({ connectionId, repository, projectId }) => {
    localStorage.setItem("git-master-connection", connectionId);
    localStorage.setItem(`git-master-repository:${connectionId}`, repository);
    localStorage.setItem(`git-master-project:${repository}`, projectId);
  }, { connectionId, repository, projectId });
  await page.route("**/api/connections", async (route) => route.fulfill({
    json: { connections: [{ id: connectionId, name: "Live App", scopeType: "organization", owner: "acme", login: "dev", createdAt: "2026-09-01T00:00:00Z" }] },
  }));
  await page.route("**/api/github/repositories?*", async (route) => route.fulfill({
    json: { repositories: [{ id: 1, nodeId: "R_LIVE", name: "live-app", fullName: repository, owner: "acme", private: true, archived: false, defaultBranch: "main", url: "https://github.test/acme/live-app" }] },
  }));
  await page.route("**/api/github/projects?*", async (route) => route.fulfill({
    json: { projects: [{ id: projectId, number: 1, title: "Live board", closed: false, url: "https://github.test/orgs/acme/projects/1" }] },
  }));
  await page.route("**/api/github/board?*", async (route) => {
    const selected = new URL(route.request().url()).searchParams.get("projectId") === projectId;
    if (selected) projectBoardReads += 1;
    const status = selected && projectBoardReads > 1 ? "Review" : "Todo";
    await route.fulfill({ json: { board: {
      source: selected ? "project" : "repository",
      ...(selected ? { projectId, statusFieldId: "STATUS" } : {}),
      statuses: [{ id: "TODO", name: "Todo" }, { id: "REVIEW", name: "Review" }],
      issues: [{ id: "live-issue", nodeId: "I_LIVE", itemId: "ITEM_LIVE", number: 8, title: "Changed by automation", body: "", state: "open", status, statusOptionId: status.toUpperCase(), url: "#", repository, labels: [], assignees: [], commentCount: 0, updatedAt: "2026-09-01T00:00:00Z" }],
    } } });
  });

  await page.goto("/login");
  await page.getByLabel("Пароль").fill("playwright-password");
  await page.getByRole("button", { name: "Відкрити workspace" }).click();
  const todo = page.getByRole("region", { name: "Todo column" });
  const review = page.getByRole("region", { name: "Review column" });
  await expect(page.locator("header select").nth(1)).toHaveValue(projectId);
  await expect(page.getByText("GitHub Project", { exact: true })).toBeVisible();
  await expect(todo.getByText("Changed by automation")).toBeVisible();

  const body = JSON.stringify({
    action: "edited",
    projects_v2_item: { node_id: "PVTI_live", project_node_id: projectId },
    changes: { field_value: { field_node_id: "STATUS", field_type: "single_select" } },
    organization: { login: "acme" },
  });
  const signature = `sha256=${createHmac("sha256", "playwright-webhook-secret").update(body).digest("hex")}`;
  const response = await request.post("/api/github/webhook", {
    data: body,
    headers: {
      "content-type": "application/json",
      "x-github-delivery": `playwright-live-delivery-${client}`,
      "x-github-event": "projects_v2_item",
      "x-hub-signature-256": signature,
    },
  });
  expect(response.ok()).toBe(true);
  await expect(review.getByText("Changed by automation")).toBeVisible();
  expect(projectBoardReads).toBe(2);
});
