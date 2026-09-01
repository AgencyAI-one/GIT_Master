import { describe, expect, it } from "vitest";
import {
  aliasesFromText,
  DEFAULT_VOICE_COMMANDS,
  normalizeVoiceCommandSettings,
  parseVoiceCommandSettings,
} from "@/lib/voice-command-settings";

describe("voice command settings", () => {
  it("loads valid persisted aliases and fills missing groups with defaults", () => {
    expect(parseVoiceCommandSettings(JSON.stringify({ editIssue: ["підправити"] }))).toEqual({
      ...DEFAULT_VOICE_COMMANDS,
      editIssue: ["підправити"],
    });
  });

  it("recovers from malformed or empty settings", () => {
    expect(parseVoiceCommandSettings("not json")).toEqual(DEFAULT_VOICE_COMMANDS);
    expect(normalizeVoiceCommandSettings({ deleteIssue: [] }).deleteIssue).toEqual(DEFAULT_VOICE_COMMANDS.deleteIssue);
  });

  it("parses comma and newline separated aliases without duplicates", () => {
    expect(aliasesFromText("редагувати, edit\nРедагувати, підправити")).toEqual(["редагувати", "edit", "підправити"]);
  });
});
