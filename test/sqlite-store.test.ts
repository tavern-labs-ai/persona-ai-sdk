import { describe, expect, it } from "vitest";

import type { MemoryRecord } from "../src/core/schema.js";
import { SqliteMemoryStore } from "../src/stores/sqlite.js";

describe("SqliteMemoryStore", () => {
  it("persists, filters, searches, and deletes records transactionally", async () => {
    const store = new SqliteMemoryStore({ path: ":memory:" });
    await store.upsertMany([
      record("memory-1", "Nova remembers the lake promise.", null),
      record("memory-2", "Nova moved to the orbital station.", "branch-b"),
    ]);

    expect(await store.list({ branchId: null })).toHaveLength(1);
    expect(await store.list({ branchIds: [null, "branch-b"] })).toHaveLength(2);
    expect((await store.search({ text: "lake promise", limit: 1 }))[0]?.memory.id).toBe("memory-1");
    expect(await store.delete("memory-1")).toBe(true);
    expect(await store.get("memory-1")).toBeNull();
    store.close();
  });
});

function record(id: string, content: string, branchId: string | null): MemoryRecord {
  return {
    id,
    characterId: "nova",
    userId: "alice",
    conversationId: "chat-1",
    branchId,
    scope: "character",
    kind: "event",
    content,
    participants: ["Nova", "Alice"],
    importance: 0.8,
    confidence: 0.9,
    sourceMessageIds: ["m1"],
    knownBy: ["Nova", "Alice"],
    occurredAt: null,
    validUntil: null,
    tags: ["story"],
    status: "active",
    visibility: "shared",
    supersedes: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lastRecalledAt: null,
    recallCount: 0,
    embedding: null,
    embeddingProvider: null,
    embeddingModel: null,
  };
}
