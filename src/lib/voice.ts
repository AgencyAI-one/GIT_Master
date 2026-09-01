import { getConfig } from "./config";
import { HttpError } from "./http";
import type { VoiceCommand } from "./types";
import {
  normalizeVoiceCommandSettings,
  type VoiceCommandSettings,
} from "./voice-command-settings";

const OPENAI_BASE_URL = "https://api.openai.com/v1";

export function fallbackTitle(body: string) {
  const firstMeaningfulLine = body
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-#>*\d.)\s]+/, "").replace(/[*_`[\]]/g, "").trim())
    .find((line) => line.length > 0);
  if (!firstMeaningfulLine) return "Untitled issue";
  const words = firstMeaningfulLine.split(/\s+/);
  const title = words.slice(0, 12).join(" ");
  return title.length > 90 ? `${title.slice(0, 87).trim()}…` : title;
}

function commandValue(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]?.trim()) return match[1].trim();
  }
}

function regexAlternatives(values: string[]) {
  return values
    .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"))
    .sort((left, right) => right.length - left.length)
    .join("|");
}

function cleanCommandValue(value: string) {
  return value.trim().replace(/^[«“\"']+|[»”\"'.,!?;:]+$/g, "").trim();
}

export function parseIssueManagementCommand(text: string, configured?: VoiceCommandSettings): VoiceCommand {
  const normalized = text.trim();
  if (!normalized) return { action: "unknown" };
  const settings = normalizeVoiceCommandSettings(configured);
  const nouns = regexAlternatives(settings.issueNouns);
  const numberTarget = `(?:(?:${nouns})\\s+)?(?:#|№|номер\\s*)?(\\d+)`;

  const edit = normalized.match(new RegExp(`^(?:${regexAlternatives(settings.editIssue)})\\s+${numberTarget}\\s*[.!?]?$`, "iu"));
  if (edit) return { action: "open_issue", issueNumber: Number(edit[1]) };

  const deleteWithNumber = normalized.match(new RegExp(`^(?:${regexAlternatives(settings.deleteIssue)})\\s+${numberTarget}\\s*[.!?]?$`, "iu"));
  if (deleteWithNumber) return { action: "delete_issue", issueNumber: Number(deleteWithNumber[1]) };

  const deleteCurrent = normalized.match(new RegExp(`^(?:${regexAlternatives(settings.deleteIssue)})(?:\\s+(?:цей|цю|це|this|the))?(?:\\s+(?:${nouns}))?\\s*[.!?]?$`, "iu"));
  if (deleteCurrent) return { action: "delete_issue" };

  const movePrefix = normalized.match(new RegExp(`^(?:${regexAlternatives(settings.moveIssue)})(?:\\s+|$)`, "iu"));
  if (!movePrefix) return { action: "unknown", value: normalized };

  let remainder = normalized.slice(movePrefix[0].length).trim();
  const entityPrefix = remainder.match(new RegExp(`^(?:${nouns})(?:\\s+|$)`, "iu"));
  if (entityPrefix) remainder = remainder.slice(entityPrefix[0].length).trim();

  let issueNumber: number | undefined;
  const number = remainder.match(/^(?:#|№|номер\s*)?(\d+)(?:\s+|$)/iu);
  if (number) {
    issueNumber = Number(number[1]);
    remainder = remainder.slice(number[0].length).trim();
  }

  const sourceAndTarget = remainder.match(/^(?:з|from)\s+(?:(?:колонки?|column)\s+)?(.+?)\s+(?:в|до|to)\s+(?:(?:колонку|column)\s+)?(.+?)\s*[.!?]?$/iu);
  if (sourceAndTarget) {
    const sourceStatus = cleanCommandValue(sourceAndTarget[1]);
    const targetStatus = cleanCommandValue(sourceAndTarget[2]);
    if (sourceStatus && targetStatus) return { action: "move_issue", issueNumber, sourceStatus, targetStatus };
  }

  const targetOnly = remainder.match(/^(?:в|до|to)\s+(?:(?:колонку|column)\s+)?(.+?)\s*[.!?]?$/iu);
  if (targetOnly) {
    const targetStatus = cleanCommandValue(targetOnly[1]);
    if (targetStatus) return { action: "move_issue", issueNumber, targetStatus };
  }

  return { action: "unknown", value: normalized };
}

export function parseVoiceCommand(text: string, settings?: VoiceCommandSettings): VoiceCommand {
  const normalized = text.trim();
  const lower = normalized.toLocaleLowerCase("uk-UA");
  if (!lower) return { action: "unknown" };

  const managementCommand = parseIssueManagementCommand(normalized, settings);
  if (managementCommand.action !== "unknown") return managementCommand;

  if (/^(відкрий|створи|додай|почни).{0,18}(задач|таск|issue)|^(open|create|new).{0,12}(task|issue)/i.test(lower)) {
    return { action: "open_create" };
  }
  const title = commandValue(normalized, [
    /^(?:встанови|зміни|додай)?\s*(?:назву|заголовок)\s*(?:на|:)?\s*(.+)$/i,
    /^(?:set|change)?\s*(?:the\s*)?title\s*(?:to|:)?\s*(.+)$/i,
  ]);
  if (title) return { action: "set_title", value: title };

  const comment = commandValue(normalized, [
    /^(?:додай|напиши)?\s*коментар\s*(?:що|:)?\s*(.+)$/i,
    /^(?:add|write)?\s*(?:a\s*)?comment\s*(?:that|:)?\s*(.+)$/i,
  ]);
  if (comment) return { action: "append_comment", value: comment };

  const body = commandValue(normalized, [
    /^(?:додай|встав)?\s*(?:в опис|до опису|опис)\s*(?:що|:)?\s*(.+)$/i,
    /^(?:add|append)?\s*(?:to\s*)?(?:the\s*)?(?:description|body)\s*(?:that|:)?\s*(.+)$/i,
  ]);
  if (body) return { action: "append_body", value: body };

  const search = commandValue(normalized, [
    /^(?:знайди|пошукай|покажи)\s+(?:задачі?|таски?|issues?)?\s*(.+)$/i,
    /^(?:find|search(?: for)?|show)\s+(?:tasks?|issues?)?\s*(.+)$/i,
  ]);
  if (search) return { action: "search", value: search };

  if (/^(опублікуй|збережи|створи)\s*(задачу|таск|issue)?[.!]?$/i.test(lower) || /^(publish|save|submit|create)\s*(the\s*)?(task|issue)?[.!]?$/i.test(lower)) {
    return { action: "submit_issue" };
  }
  if (/^(онови|перезавантаж).*(дошк|задач)|^(refresh|reload).*(board|tasks?)/i.test(lower)) {
    return { action: "refresh" };
  }
  if (/^(закрий|сховай).*(вікно|панель|редактор)|^(close|hide).*(panel|editor|issue)/i.test(lower)) {
    return { action: "close_panel" };
  }
  return { action: "unknown", value: normalized };
}

export function parseEditorVoiceInput(text: string, settings?: VoiceCommandSettings): VoiceCommand {
  const normalized = text.trim();
  if (!normalized) return { action: "unknown" };

  const managementCommand = parseIssueManagementCommand(normalized, settings);
  if (managementCommand.action !== "unknown") return managementCommand;

  const savePatterns = [
    /^(?:збережи|зберегти|опублікуй|опублікувати|додай|додати|створи|створити|заверши|завершити|save|publish|submit|create|finish)(?:\s+(?:цей|цю|це|this|the))?(?:\s+(?:задачу|завдання|таск|task|issue))?[.!]?$/i,
    /^(?:закрий|закрити|заверши|завершити|close|finish)\s+(?:і|та|and)\s+(?:додай|додати|збережи|зберегти|опублікуй|опублікувати|add|save|publish)(?:\s+(?:цей|цю|це|this|the))?(?:\s+(?:задачу|завдання|таск|task|issue))?[.!]?$/i,
    /^(?:додай|додати|збережи|зберегти|опублікуй|опублікувати|add|save|publish)\s+(?:і|та|and)\s+(?:закрий|закрити|заверши|завершити|close|finish)(?:\s+(?:цей|цю|це|this|the))?(?:\s+(?:задачу|завдання|таск|task|issue))?[.!]?$/i,
  ];
  if (savePatterns.some((pattern) => pattern.test(normalized))) return { action: "submit_issue" };

  const cancelPatterns = [
    /^(?:скасуй|скасувати|відміни|відмінити|відхили|відхилити|cancel|discard)(?:\s+(?:створення|редагування|creation|editing))?(?:\s+(?:цієї|цю|this|the))?(?:\s+(?:задачі|задачу|завдання|таску|таск|task|issue))?[.!]?$/i,
    /^(?:закрий|закрити|close)\s+(?:без\s+збереження|without\s+saving)(?:\s+(?:задачу|завдання|таск|task|issue|редактор|editor))?[.!]?$/i,
  ];
  if (cancelPatterns.some((pattern) => pattern.test(normalized))) return { action: "close_panel" };

  const explicit = parseVoiceCommand(normalized, settings);
  if (["open_issue", "delete_issue", "move_issue", "set_title", "append_body", "append_comment", "submit_issue", "close_panel"].includes(explicit.action)) return explicit;

  return { action: "append_body", value: normalized };
}

async function openaiRequest<T>(path: string, init: RequestInit): Promise<T> {
  const apiKey = getConfig().openaiApiKey;
  if (!apiKey) throw new HttpError(503, "Voice AI is not configured. Add OPENAI_API_KEY to the environment.");
  const response = await fetch(`${OPENAI_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => undefined);
  if (!response.ok) {
    const message = (body as { error?: { message?: string } } | undefined)?.error?.message;
    throw new HttpError(response.status, message || "Voice AI request failed");
  }
  return body as T;
}

export async function transcribeAudio(input: {
  file: File;
  language?: string;
  context?: string;
}) {
  const data = new FormData();
  data.set("file", input.file, input.file.name || "voice.webm");
  data.set("model", getConfig().transcribeModel);
  data.set("response_format", "json");
  if (input.language && input.language !== "auto") data.set("language", input.language);
  data.set(
    "prompt",
    `Українська та English GitHub issue dictation; the speaker may freely mix both languages. Preserve the spoken language, punctuation, developer terminology, code identifiers, file names and product names.${input.context ? ` Existing context: ${input.context.slice(-1200)}` : ""}`,
  );
  const response = await openaiRequest<{ text: string }>("/audio/transcriptions", { method: "POST", body: data });
  return response.text.trim();
}

async function chatJson<T>(system: string, user: string): Promise<T> {
  const body = await openaiRequest<{ choices: Array<{ message: { content: string | null } }> }>("/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: getConfig().textModel,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  const content = body.choices[0]?.message.content;
  if (!content) throw new HttpError(502, "Voice AI returned an empty response");
  try {
    return JSON.parse(content) as T;
  } catch {
    throw new HttpError(502, "Voice AI returned invalid structured data");
  }
}

export async function generateIssueTitle(body: string, repository?: string) {
  if (!getConfig().openaiApiKey) return fallbackTitle(body);
  const result = await chatJson<{ title: string }>(
    "Create a concise, specific GitHub issue title from the description. Keep the description language. Use imperative or outcome-oriented wording, no markdown, no issue prefix. Return JSON: {\"title\":\"...\"}.",
    `Repository: ${repository || "unknown"}\nDescription:\n${body.slice(0, 12000)}`,
  );
  return result.title.trim().slice(0, 256) || fallbackTitle(body);
}

export async function interpretVoiceCommand(text: string, context?: Record<string, unknown>): Promise<VoiceCommand> {
  const voiceCommands = normalizeVoiceCommandSettings(context?.voiceCommands);
  const managementCommand = parseIssueManagementCommand(text, voiceCommands);
  if (managementCommand.action !== "unknown") return managementCommand;
  if (context?.editorOpen === true) return parseEditorVoiceInput(text, voiceCommands);
  if (!getConfig().openaiApiKey) return parseVoiceCommand(text, voiceCommands);
  try {
    const result = await chatJson<{ action: VoiceCommand["action"]; value?: string }>(
      `You are the command router for Git Master, a GitHub issue manager. Understand Ukrainian, English, and mixed Ukrainian-English developer speech. Allowed actions: open_create, set_title, append_body, append_comment, submit_issue, search, refresh, close_panel, unknown. Never invent content. Return JSON with action and optional value. "Create/open a task" means open_create; only explicit publish/save/submit means submit_issue.`,
      `Workspace context: ${JSON.stringify(context || {})}\nSpoken command: ${text}`,
    );
    const allowed = new Set(["open_create", "set_title", "append_body", "append_comment", "submit_issue", "search", "refresh", "close_panel", "unknown"]);
    if (!allowed.has(result.action)) return parseVoiceCommand(text, voiceCommands);
    if (result.action === "unknown") return { action: "unknown", value: text.trim() };
    return result as VoiceCommand;
  } catch {
    return parseVoiceCommand(text, voiceCommands);
  }
}
