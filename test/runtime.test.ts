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
        occurredAt: null,
        validUntil: null,
        tags: ["lake", "promise"],
      },
    ];
  },
};

const embeddings: EmbeddingProvider = {
  provider: "test",
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
});
