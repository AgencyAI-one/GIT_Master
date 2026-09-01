import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { nanoid } from "nanoid";
import { getConfig } from "./config";
import { decryptSecret, encryptSecret } from "./crypto";
import type { Connection, ConnectionScope } from "./types";

type ConnectionRow = {
  id: string;
  name: string;
  scope_type: ConnectionScope;
  owner: string | null;
  repository: string | null;
  login: string;
  avatar_url: string | null;
  encrypted_token: string;
  created_at: string;
};

type StoredConnection = Connection & { token: string };

const globalDb = globalThis as unknown as { gitMasterDb?: Database.Database };

function getDb() {
  if (globalDb.gitMasterDb) return globalDb.gitMasterDb;
  const databasePath = resolve(/* turbopackIgnore: true */ process.cwd(), getConfig().databasePath);
  mkdirSync(dirname(databasePath), { recursive: true });
  const db = new Database(databasePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS connections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      scope_type TEXT NOT NULL CHECK (scope_type IN ('account', 'organization', 'repository')),
      owner TEXT,
      repository TEXT,
      login TEXT NOT NULL,
      avatar_url TEXT,
      encrypted_token TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_connections_created_at ON connections(created_at);
  `);
  globalDb.gitMasterDb = db;
  return db;
}

function publicConnection(row: ConnectionRow): Connection {
  return {
    id: row.id,
    name: row.name,
    scopeType: row.scope_type,
    owner: row.owner || undefined,
    repository: row.repository || undefined,
    login: row.login,
    avatarUrl: row.avatar_url || undefined,
    createdAt: row.created_at,
  };
}

export function listConnections(): Connection[] {
  return (getDb().prepare("SELECT * FROM connections ORDER BY created_at ASC").all() as ConnectionRow[]).map(
    publicConnection,
  );
}

export function getConnection(id: string): StoredConnection | undefined {
  const row = getDb().prepare("SELECT * FROM connections WHERE id = ?").get(id) as ConnectionRow | undefined;
  if (!row) return undefined;
  return {
    ...publicConnection(row),
    token: decryptSecret(row.encrypted_token, getConfig().encryptionKey),
  };
}

export function createConnection(input: {
  name: string;
  scopeType: ConnectionScope;
  owner?: string;
  repository?: string;
  login: string;
  avatarUrl?: string;
  token: string;
}): Connection {
  const connection: Connection = {
    id: nanoid(12),
    name: input.name,
    scopeType: input.scopeType,
    owner: input.owner,
    repository: input.repository,
    login: input.login,
    avatarUrl: input.avatarUrl,
    createdAt: new Date().toISOString(),
  };
  getDb()
    .prepare(
      `INSERT INTO connections
       (id, name, scope_type, owner, repository, login, avatar_url, encrypted_token, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      connection.id,
      connection.name,
      connection.scopeType,
      connection.owner || null,
      connection.repository || null,
      connection.login,
      connection.avatarUrl || null,
      encryptSecret(input.token, getConfig().encryptionKey),
      connection.createdAt,
    );
  return connection;
}

export function deleteConnection(id: string) {
  return getDb().prepare("DELETE FROM connections WHERE id = ?").run(id).changes > 0;
}

export function closeDatabaseForTests() {
  globalDb.gitMasterDb?.close();
  delete globalDb.gitMasterDb;
}
