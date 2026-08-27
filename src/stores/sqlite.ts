import Database from "better-sqlite3";

import { memoryRecordSchema, type MemoryRecord } from "../core/schema.js";
import { scoreMemory } from "../core/scoring.js";
import type {
  MemoryFilters,
  MemorySearchQuery,
  MemorySearchResult,
  MemoryStore,
} from "../core/types.js";

export interface SqliteMemoryStoreOptions {
  path?: string;
  database?: Database.Database;
  readonly?: boolean;
}

interface RecordRow {
  record_json: string;
}

/** Durable local store with indexed metadata filtering and transactional writes. */
export class SqliteMemoryStore implements MemoryStore {
  readonly kind = "sqlite";
  readonly #database: Database.Database;
  readonly #ownsDatabase: boolean;
  readonly #upsertStatement: Database.Statement;

  constructor(options: SqliteMemoryStoreOptions = {}) {
    if (options.database !== undefined) {
      this.#database = options.database;
      this.#ownsDatabase = false;
    } else {
      this.#database = new Database(options.path ?? "character-memory.sqlite", {
        readonly: options.readonly ?? false,
      });
      this.#ownsDatabase = true;
    }

    this.#database.pragma("foreign_keys = ON");
    this.#database.pragma("busy_timeout = 5000");
    if (!this.#database.readonly && this.#database.name !== ":memory:") {
      this.#database.pragma("journal_mode = WAL");
    }
    this.#migrate();
    this.#upsertStatement = this.#database.prepare(`
      INSERT INTO memories (
        id, character_id, user_id, conversation_id, branch_id, scope, kind,
        status, visibility, valid_until, updated_at, record_json
      ) VALUES (
        @id, @characterId, @userId, @conversationId, @branchId, @scope, @kind,
        @status, @visibility, @validUntil, @updatedAt, @recordJson
      )
      ON CONFLICT(id) DO UPDATE SET
        character_id = excluded.character_id,
        user_id = excluded.user_id,
        conversation_id = excluded.conversation_id,
        branch_id = excluded.branch_id,
        scope = excluded.scope,
        kind = excluded.kind,
        status = excluded.status,
        visibility = excluded.visibility,
        valid_until = excluded.valid_until,
        updated_at = excluded.updated_at,
        record_json = excluded.record_json
    `);
  }

  async upsert(memory: MemoryRecord): Promise<void> {
    this.#write(memoryRecordSchema.parse(memory));
  }

  async upsertMany(memories: readonly MemoryRecord[]): Promise<void> {
    const transaction = this.#database.transaction((records: readonly MemoryRecord[]) => {
      for (const memory of records) this.#write(memoryRecordSchema.parse(memory));
    });
    transaction(memories);
  }

  async get(id: string): Promise<MemoryRecord | null> {
    const row = this.#database.prepare("SELECT record_json FROM memories WHERE id = ?").get(id) as
      RecordRow | undefined;
    return row === undefined ? null : parseRecord(row);
  }

  async delete(id: string): Promise<boolean> {
    return this.#database.prepare("DELETE FROM memories WHERE id = ?").run(id).changes > 0;
  }

  async list(filters: MemoryFilters = {}): Promise<readonly MemoryRecord[]> {
    const where = buildWhere(filters);
    const rows = this.#database
      .prepare(`SELECT record_json FROM memories${where.sql} ORDER BY updated_at DESC, id ASC`)
      .all(...where.parameters) as RecordRow[];
    return rows.map(parseRecord);
  }

  async search(query: MemorySearchQuery): Promise<readonly MemorySearchResult[]> {
    const now = query.now ?? new Date();
    const limit = Math.max(0, query.limit ?? 10);
    const records = await this.list(query);
    return records
      .filter(
        (memory) => memory.validUntil === null || Date.parse(memory.validUntil) > now.getTime(),
      )
      .map((memory) => ({
        memory,
        ...scoreMemory(memory, query.text, query.embedding, now),
      }))
      .sort(
        (left, right) => right.score - left.score || left.memory.id.localeCompare(right.memory.id),
      )
      .slice(0, limit);
  }

  close(): void {
    if (this.#ownsDatabase && this.#database.open) this.#database.close();
  }

  #write(memory: MemoryRecord): void {
    this.#upsertStatement.run({
      id: memory.id,
      characterId: memory.characterId,
      userId: memory.userId,
      conversationId: memory.conversationId,
      branchId: memory.branchId,
      scope: memory.scope,
      kind: memory.kind,
      status: memory.status,
      visibility: memory.visibility,
      validUntil: memory.validUntil,
      updatedAt: memory.updatedAt,
      recordJson: JSON.stringify(memory),
    });
  }

  #migrate(): void {
    const version = this.#database.pragma("user_version", { simple: true }) as number;
    if (version > 1) throw new Error(`SQLite memory schema version ${version} is not supported.`);
    if (version === 1) return;
    if (this.#database.readonly)
      throw new Error("Cannot initialize a readonly SQLite memory store.");

    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        character_id TEXT NOT NULL,
        user_id TEXT,
        conversation_id TEXT NOT NULL,
        branch_id TEXT,
        scope TEXT NOT NULL,
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        visibility TEXT NOT NULL,
        valid_until TEXT,
        updated_at TEXT NOT NULL,
        record_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS memories_identity_idx
        ON memories(character_id, user_id, status);
      CREATE INDEX IF NOT EXISTS memories_conversation_idx
        ON memories(conversation_id, branch_id);
      CREATE INDEX IF NOT EXISTS memories_kind_idx
        ON memories(scope, kind, status);
      PRAGMA user_version = 1;
    `);
  }
}

function parseRecord(row: RecordRow): MemoryRecord {
  return memoryRecordSchema.parse(JSON.parse(row.record_json));
}

function buildWhere(filters: MemoryFilters): { sql: string; parameters: unknown[] } {
  const clauses: string[] = [];
  const parameters: unknown[] = [];

  addScalar(clauses, parameters, "character_id", filters.characterId);
  if (filters.userId !== undefined) {
    if (filters.userId === null) clauses.push("user_id IS NULL");
    else addScalar(clauses, parameters, "user_id", filters.userId);
  }
  addScalar(clauses, parameters, "conversation_id", filters.conversationId);
  if (filters.branchId !== undefined) {
    if (filters.branchId === null) clauses.push("branch_id IS NULL");
    else addScalar(clauses, parameters, "branch_id", filters.branchId);
  }
  addArray(clauses, parameters, "scope", filters.scopes);
  addArray(clauses, parameters, "kind", filters.kinds);
  addArray(clauses, parameters, "status", filters.statuses);
  addArray(clauses, parameters, "visibility", filters.visibilities);

  if (filters.branchIds !== undefined) {
    const concrete = filters.branchIds.filter((value): value is string => value !== null);
    const includesNull = filters.branchIds.includes(null);
    const parts: string[] = [];
    if (concrete.length > 0) {
      parts.push(`branch_id IN (${concrete.map(() => "?").join(", ")})`);
      parameters.push(...concrete);
    }
    if (includesNull) parts.push("branch_id IS NULL");
    clauses.push(parts.length === 0 ? "0 = 1" : `(${parts.join(" OR ")})`);
  }

  return {
    sql: clauses.length === 0 ? "" : ` WHERE ${clauses.join(" AND ")}`,
    parameters,
  };
}

function addScalar(
  clauses: string[],
  parameters: unknown[],
  column: string,
  value: string | undefined,
): void {
  if (value === undefined) return;
  clauses.push(`${column} = ?`);
  parameters.push(value);
}

function addArray(
  clauses: string[],
  parameters: unknown[],
  column: string,
  values: readonly string[] | undefined,
): void {
  if (values === undefined) return;
  if (values.length === 0) {
    clauses.push("0 = 1");
    return;
  }
  clauses.push(`${column} IN (${values.map(() => "?").join(", ")})`);
  parameters.push(...values);
}
