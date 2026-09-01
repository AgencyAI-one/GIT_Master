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
  await page.keyboard.down("v");
  await expect(page.getByText("Слухаю…")).toBeVisible();
  await page.keyboard.up("v");
  await page.keyboard.up("Alt");
  await expect(page.getByText("перша команда")).toBeVisible();

  await page.keyboard.down("Alt");
  await page.keyboard.press("v");
  await page.waitForTimeout(50);
  await page.keyboard.press("v");
  await page.keyboard.up("Alt");
  await expect(page.getByText("Запис зафіксовано")).toBeVisible();
  await page.keyboard.press("Alt+v");
  await expect(page.getByText("друга команда")).toBeVisible();
});

test("dictates multiple issue fragments and saves or cancels by voice", async ({ page }) => {
  const connectionId = "voice-editor-connection";
  const repository = "acme/voice-app";
  const transcripts = [
    "Відкрий нову задачу",
    "Потрібно додати українську валідацію",
    "Handle English error messages",
    "Збережи задачу",
    "Open a new issue",
    "Temporary draft",
    "Cancel issue",
  ];
  let transcriptIndex = 0;
  const editorContexts: boolean[] = [];
  const createdBodies: string[] = [];

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

  await page.goto("/login");
  await page.getByLabel("Пароль").fill("playwright-password");
  await page.getByRole("button", { name: "Відкрити workspace" }).click();
  await page.getByRole("button", { name: "Голосова команда" }).focus();

  await page.keyboard.press("Alt+v");
  const drawer = page.getByRole("dialog", { name: "Нове issue" });
  await expect(drawer).toBeVisible();

  const description = page.getByPlaceholder("Опишіть очікуваний результат, контекст і критерії готовності…");
  await page.keyboard.press("Alt+v");
  await expect(description).toHaveValue("Потрібно додати українську валідацію");
  await page.keyboard.press("Alt+v");
  await expect(description).toHaveValue("Потрібно додати українську валідацію\n\nHandle English error messages");
  await page.keyboard.press("Alt+v");
  await expect(drawer).toHaveCount(0);
  await expect(page.getByText("Bilingual voice task")).toBeVisible();
  expect(createdBodies).toEqual(["Потрібно додати українську валідацію\n\nHandle English error messages"]);

  await page.keyboard.press("Alt+v");
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Alt+v");
  await expect(description).toHaveValue("Temporary draft");
  await page.keyboard.press("Alt+v");
  await expect(drawer).toHaveCount(0);
  await expect(page.getByText("Створення issue скасовано")).toBeVisible();
  expect(createdBodies).toHaveLength(1);
  expect(editorContexts).toEqual([false, true, true, true, false, true, true]);
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

  await page.keyboard.press("Alt+v");
  const drawer = page.getByRole("dialog", { name: "Issue 432" });
  await expect(drawer).toBeVisible();
  await drawer.getByRole("button", { name: "Закрити", exact: true }).click();

  await page.keyboard.press("Alt+v");
  const reviewColumn = page.getByRole("region", { name: "Review column" });
  await expect(reviewColumn.getByText("Manage me by voice")).toBeVisible();
  expect(statusUpdates).toMatchObject([{ issueNumber: 432, status: "Review" }]);

  await expect(page.getByText("Issue #432 перенесено в «Review»")).toBeVisible();
  await page.waitForTimeout(500);
  await page.keyboard.press("Alt+v");
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

  await page.addInitScript(({ connectionId, repository }) => {
    localStorage.setItem("git-master-connection", connectionId);
    localStorage.setItem(`git-master-repository:${connectionId}`, repository);
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
  await newComment.evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array([137, 80, 78, 71])], "clipboard-shot.png", { type: "image/png" }));
    element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: transfer }));
  });
  await expect(drawer.getByText("clipboard-shot.png")).toBeVisible();

  await page.getByRole("button", { name: "Редагувати коментар 91" }).click();
  const editedComment = drawer.getByPlaceholder("Відредагуйте коментар…");
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
  await page.getByRole("button", { name: "Видалити", exact: true }).click();
  await page.getByRole("button", { name: "Так, видалити" }).click();
  await expect(page.getByText("Existing task")).toHaveCount(0);
  await expect(page.getByText("Created without refresh")).toBeVisible();
});

test("demo cards can move between columns", async ({ page, isMobile }) => {
  test.skip(Boolean(isMobile), "Native HTML drag-and-drop is a desktop interaction");
  await page.getByLabel("Пароль").fill("playwright-password");
  await page.getByRole("button", { name: "Відкрити workspace" }).click();
  const card = page.getByRole("button", { name: /Command palette для швидкої навігації/ });
  const reviewColumn = page.getByRole("region", { name: "Review column" });
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await card.dispatchEvent("dragstart", { dataTransfer });
  await reviewColumn.dispatchEvent("dragover", { dataTransfer });
  await reviewColumn.dispatchEvent("drop", { dataTransfer });
  await expect(reviewColumn.getByText("Command palette для швидкої навігації")).toBeVisible();
});

test("a slower repository response cannot overwrite the selected Project board", async ({ page }) => {
  const connectionId = "race-connection";
  const repository = "acme/web";
  const projectId = "PVT_race";
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
      issues: [{ id: "correct", nodeId: "I_1", itemId: "ITEM_1", number: 1, title: "Correct review issue", body: "", state: "open", status: "In review", statusOptionId: "REVIEW", url: "#", repository, labels: [], assignees: [], commentCount: 0, updatedAt: "2026-09-01T00:00:00Z" }],
    } : {
      source: "repository",
      statuses: [{ id: "in-progress", name: "In progress" }, { id: "review", name: "Review" }, { id: "done", name: "Done" }],
      issues: [{ id: "wrong", nodeId: "I_2", number: 2, title: "Wrong fallback issue", body: "", state: "open", status: "In progress", url: "#", repository, labels: [], assignees: [], commentCount: 0, updatedAt: "2026-09-01T00:00:00Z" }],
    } } });
  });

  await page.goto("/login");
  await page.getByLabel("Пароль").fill("playwright-password");
  await page.getByRole("button", { name: "Відкрити workspace" }).click();
  await expect(page.getByText("Correct review issue")).toBeVisible();
  await page.waitForTimeout(900);
  await expect(page.getByText("Correct review issue")).toBeVisible();
  await expect(page.getByText("Wrong fallback issue")).toHaveCount(0);
  await expect(page.getByText("GitHub Project", { exact: true })).toBeVisible();
});
