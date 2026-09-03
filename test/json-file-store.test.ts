import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { MemoryRecord } from "../src/core/schema.js";
import { JsonFileMemoryStore } from "../src/stores/json-file.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("JsonFileMemoryStore", () => {
  it("persists versioned records and reloads them", async () => {
    const directory = await mkdtemp(join(tmpdir(), "character-memory-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "memory.json");
    const store = new JsonFileMemoryStore({ path });

    await store.upsert(record());

    const serialized = JSON.parse(await readFile(path, "utf8")) as { version: number };
    expect(serialized.version).toBe(2);

    const reloaded = new JsonFileMemoryStore({ path });
    expect((await reloaded.get("memory-1"))?.content).toBe("Nova prefers black coffee.");
  });
});

function record(): MemoryRecord {
  return {
    id: "memory-1",
    characterId: "nova",
    userId: "alice",
    conversationId: "chat-1",
    branchId: null,
    scope: "character",
    kind: "preference",
    content: "Nova prefers black coffee.",
    participants: ["Nova"],
    importance: 0.7,
    confidence: 0.9,
    sourceMessageIds: ["m1"],
    knownBy: ["Nova", "Alice"],
    occurredAt: null,
    validUntil: null,
    tags: ["coffee"],
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
