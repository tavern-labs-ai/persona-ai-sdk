import { createHash } from "node:crypto";

import type { CharacterMemoryRuntime } from "../core/runtime.js";
import type { IngestMessage, IngestResult } from "../core/types.js";

export interface SillyTavernChat {
  metadata: Record<string, unknown>;
  messages: readonly IngestMessage[];
  userName: string | null;
  characterName: string | null;
}

export interface ImportChatOptions {
  characterId: string;
  userId?: string | null;
  conversationId: string;
  branchId?: string | null;
  batchSize?: number;
  signal?: AbortSignal;
  onProgress?: (progress: { processed: number; total: number; result: IngestResult }) => void;
}

/** Parse the lossless JSONL export produced by SillyTavern's chat manager. */
export function parseSillyTavernChat(source: string): SillyTavernChat {
  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) throw new Error("SillyTavern chat export is empty.");
  const values = lines.map((line, index) => {
    try {
      return JSON.parse(line) as unknown;
    } catch (error) {
      throw new Error(`Invalid JSON on chat line ${index + 1}.`, { cause: error });
    }
  });
  const header =
    isRecord(values[0]) && isHeader(values[0]) ? (values.shift() as Record<string, unknown>) : {};
  const messages: IngestMessage[] = [];
  values.forEach((value, index) => {
    if (!isRecord(value) || typeof value.mes !== "string") return;
    const name = typeof value.name === "string" && value.name !== "" ? value.name : null;
    const id = stableMessageId(value, index);
    const timestamp = parseTimestamp(value.send_date);
    messages.push({
      id,
      role: value.is_user === true ? "user" : "assistant",
      content: value.mes,
      name,
      timestamp,
      characterId: value.is_user === true ? null : name,
    });
  });
  return {
    metadata: header,
    messages,
    userName: typeof header.user_name === "string" ? header.user_name : null,
    characterName: typeof header.character_name === "string" ? header.character_name : null,
  };
}

/** Backfill a chat through the normal extraction/consolidation path in bounded batches. */
export async function importSillyTavernChat(
  runtime: CharacterMemoryRuntime,
  chat: SillyTavernChat,
  options: ImportChatOptions,
): Promise<{ batches: number; processed: number; results: readonly IngestResult[] }> {
  const size = Math.max(1, options.batchSize ?? 40);
  const results: IngestResult[] = [];
  for (let offset = 0; offset < chat.messages.length; offset += size) {
    if (options.signal?.aborted === true)
      throw options.signal.reason ?? new Error("Chat import aborted.");
    const result = await runtime.ingest({
      characterId: options.characterId,
      userId: options.userId ?? null,
      conversationId: options.conversationId,
      branchId: options.branchId ?? null,
      messages: chat.messages.slice(offset, offset + size),
    });
    results.push(result);
    options.onProgress?.({
      processed: Math.min(offset + size, chat.messages.length),
      total: chat.messages.length,
      result,
    });
  }
  return { batches: results.length, processed: chat.messages.length, results };
}

function stableMessageId(message: Record<string, unknown>, index: number): string {
  const extra = isRecord(message.extra) ? message.extra : {};
  const existing = extra.message_id ?? message.id;
  if (typeof existing === "string" && existing !== "") return existing;
  return `st-${index}-${createHash("sha256").update(JSON.stringify(message)).digest("hex").slice(0, 12)}`;
}

function parseTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || value === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function isHeader(value: Record<string, unknown>): boolean {
  return "user_name" in value || "character_name" in value || "chat_metadata" in value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
