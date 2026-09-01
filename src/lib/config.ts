import { createHash } from "node:crypto";

export type AppConfig = {
  password: string;
  secret: string;
  encryptionKey: Buffer;
  databasePath: string;
  githubApiUrl: string;
  githubUploadBranch?: string;
  openaiApiKey?: string;
  transcribeModel: string;
  textModel: string;
  usingUnsafeDefaults: boolean;
};

const DEV_PASSWORD = "gitmaster";
const DEV_SECRET = "git-master-local-development-secret-change-me";

export function getConfig(env = process.env): AppConfig {
  const isProduction = env.NODE_ENV === "production";
  const password = env.APP_PASSWORD || (!isProduction ? DEV_PASSWORD : "");
  const secret = env.APP_SECRET || (!isProduction ? DEV_SECRET : "");

  if (!password || !secret) {
    throw new Error("APP_PASSWORD and APP_SECRET are required in production");
  }
  if (secret.length < 32) {
    throw new Error("APP_SECRET must contain at least 32 characters");
  }

  const rawEncryptionKey = env.ENCRYPTION_KEY;
  let encryptionKey: Buffer;
  if (rawEncryptionKey) {
    encryptionKey = /^[a-f\d]{64}$/i.test(rawEncryptionKey)
      ? Buffer.from(rawEncryptionKey, "hex")
      : createHash("sha256").update(rawEncryptionKey).digest();
  } else if (!isProduction) {
    encryptionKey = createHash("sha256").update(secret).digest();
  } else {
    throw new Error("ENCRYPTION_KEY is required in production");
  }

  return {
    password,
    secret,
    encryptionKey,
    databasePath: env.DATABASE_PATH || "./data/git-master.db",
    githubApiUrl: (env.GITHUB_API_URL || "https://api.github.com").replace(/\/$/, ""),
    githubUploadBranch: env.GITHUB_UPLOAD_BRANCH,
    openaiApiKey: env.OPENAI_API_KEY,
    transcribeModel: env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe",
    textModel: env.OPENAI_TEXT_MODEL || "gpt-4o-mini",
    usingUnsafeDefaults: !env.APP_PASSWORD || !env.APP_SECRET || !env.ENCRYPTION_KEY,
  };
}
