export type VoiceCommandSettings = {
  editIssue: string[];
  deleteIssue: string[];
  moveIssue: string[];
  issueNouns: string[];
};

export const DEFAULT_VOICE_COMMANDS: VoiceCommandSettings = {
  editIssue: ["редагувати", "редагуй", "правити", "праивти", "виправити", "змінити", "edit"],
  deleteIssue: ["видалити", "видали", "знищити", "знищ", "delete", "remove"],
  moveIssue: ["перенести", "перенеси", "перемістити", "перемісти", "move"],
  issueNouns: ["задачу", "задача", "задачі", "завдання", "таск", "task", "issue", "ішю"],
};

export const VOICE_COMMANDS_STORAGE_KEY = "git-master-voice-commands";

const SETTINGS_KEYS = ["editIssue", "deleteIssue", "moveIssue", "issueNouns"] as const;
const MAX_ALIASES_PER_GROUP = 30;
const MAX_ALIAS_LENGTH = 40;

function normalizedAliases(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const unique = new Map<string, string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const alias = item.trim().replace(/\s+/g, " ").slice(0, MAX_ALIAS_LENGTH);
    if (!alias) continue;
    const key = alias.toLocaleLowerCase("uk-UA");
    if (!unique.has(key)) unique.set(key, alias);
    if (unique.size >= MAX_ALIASES_PER_GROUP) break;
  }
  return [...unique.values()];
}

export function normalizeVoiceCommandSettings(value: unknown): VoiceCommandSettings {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries(SETTINGS_KEYS.map((key) => {
    const aliases = normalizedAliases(input[key]);
    return [key, aliases?.length ? aliases : DEFAULT_VOICE_COMMANDS[key]];
  })) as VoiceCommandSettings;
}

export function parseVoiceCommandSettings(value: string | null): VoiceCommandSettings {
  if (!value) return DEFAULT_VOICE_COMMANDS;
  try {
    return normalizeVoiceCommandSettings(JSON.parse(value));
  } catch {
    return DEFAULT_VOICE_COMMANDS;
  }
}

export function aliasesFromText(value: string) {
  return normalizedAliases(value.split(/[,\n]/)) || [];
}
