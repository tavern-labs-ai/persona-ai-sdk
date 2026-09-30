import { describe, expect, it } from "vitest";

import { createCharacterMemoryRuntime } from "../src/core/runtime.js";
import type { EmbeddingProvider, MemoryExtractor } from "../src/core/types.js";
import { InMemoryMemoryStore } from "../src/stores/in-memory.js";

const extractor: MemoryExtractor = {
  provider: "test",
  async extract() {
    return [
      {
        scope: "relationship",
        kind: "event",
        content: "Nova and Alice promised to return to the lake together.",
        participants: ["Nova", "Alice"],
        importance: 0.9,
        confidence: 0.95,
        sourceMessageIds: ["m1"],
        knownBy: ["Nova", "Alice"],
        occurredAt: null,
        validUntil: null,
        tags: ["lake", "promise"],
      },
    ];
  },
};

const embeddings: EmbeddingProvider = {
  provider: "test",
  model: "test-embedding",
  dimensions: 3,
  async embed(texts) {
    return texts.map((text) => (text.toLocaleLowerCase().includes("lake") ? [1, 0, 0] : [0, 1, 0]));
  },
};

describe("CharacterMemoryRuntime", () => {
  it("extracts, stores, and recalls structured memories", async () => {
    const runtime = createCharacterMemoryRuntime({
      extractor,
      embeddings,
      store: new InMemoryMemoryStore(),
      createId: () => "memory-1",
      now: () => new Date("2026-01-01T00:00:00.000Z"),
    });

    const ingested = await runtime.ingest({
      characterId: "nova",
      userId: "alice",
      conversationId: "chat-1",
      messages: [
        {
          id: "m1",
          role: "user",
          content: "Promise we'll return to the lake.",
          name: "Alice",
          timestamp: null,
          characterId: null,
        },
      ],
    });

    expect(ingested.created).toHaveLength(1);
    expect(ingested.created[0]?.embedding).toEqual([1, 0, 0]);

    const recalled = await runtime.recall({
      characterId: "nova",
      userId: "alice",
      query: "What did we decide about the lake?",
    });

    expect(recalled.memories).toHaveLength(1);
    expect(recalled.context).toContain("promised to return to the lake");
    expect((await runtime.store.get("memory-1"))?.recallCount).toBe(1);
  });

  it("merges exact normalized duplicates instead of growing forever", async () => {
    let nextId = 0;
    const runtime = createCharacterMemoryRuntime({
      extractor,
      store: new InMemoryMemoryStore(),
      createId: () => `memory-${++nextId}`,
    });
    const input = {
      characterId: "nova",
      userId: "alice",
      conversationId: "chat-1",
      messages: [
        {
          id: "m1",
          role: "user" as const,
          content: "The lake promise.",
          name: null,
          timestamp: null,
          characterId: null,
        },
      ],
    };

    expect((await runtime.ingest(input)).created).toHaveLength(1);
    expect((await runtime.ingest(input)).merged).toHaveLength(1);
    expect(await runtime.store.list()).toHaveLength(1);
  });

  it("drops unsupported source IDs and low-confidence memories", async () => {
    const unsafeExtractor: MemoryExtractor = {
      provider: "test",
      async extract() {
        return [
          {
            scope: "character",
            kind: "fact",
            content: "Unsupported claim",
            participants: ["Nova"],
            importance: 1,
            confidence: 0.1,
            sourceMessageIds: ["invented-message"],
            knownBy: ["Nova"],
            occurredAt: null,
            validUntil: null,
            tags: [],
          },
        ];
      },
    };
    const runtime = createCharacterMemoryRuntime({
      extractor: unsafeExtractor,
      store: new InMemoryMemoryStore(),
    });

    const result = await runtime.ingest({
      characterId: "nova",
      conversationId: "chat-1",
      messages: [
        {
          id: "real-message",
          role: "user",
          content: "Hello",
          name: null,
          timestamp: null,
          characterId: null,
        },
      ],
    });

    expect(result.created).toEqual([]);
  });

  it("forks branch state and compacts old records into a story arc", async () => {
    let nextId = 0;
    const multiExtractor: MemoryExtractor = {
      provider: "test",
      async extract(input) {
        return input.messages.map((message, index) => ({
          scope: "conversation" as const,
          kind: "event" as const,
          content: `Event ${index}: ${message.content}`,
          participants: ["Nova"],
          importance: 0.6,
          confidence: 0.9,
          sourceMessageIds: [message.id],
          knownBy: ["nova"],
          occurredAt: null,
          validUntil: null,
          tags: ["scene"],
        }));
      },
    };
    const runtime = createCharacterMemoryRuntime({
      extractor: multiExtractor,
      store: new InMemoryMemoryStore(),
      createId: () => `generated-${++nextId}`,
      now: () => new Date("2026-01-01T00:00:00.000Z"),
    });
    await runtime.ingest({
      characterId: "nova",
      conversationId: "chat-1",
      branchId: "main",
      messages: ["one", "two", "three", "four"].map((content, index) => ({
        id: `m${index}`,
        role: "user" as const,
        content,
      })),
    });

    expect(
      await runtime.forkBranch({ characterId: "nova", branchId: "main", toBranchId: "alternate" }),
    ).toBe(4);
    const compacted = await runtime.compact({
      characterId: "nova",
      branchId: "main",
      compactor: { compact: (memories) => `A four-part scene: ${memories.length} events.` },
    });
    expect(compacted.storyArc?.kind).toBe("story_arc");
    expect(compacted.archived).toBe(4);
    expect(await runtime.store.list({ branchId: "alternate", statuses: ["active"] })).toHaveLength(
      4,
    );
  });
});
