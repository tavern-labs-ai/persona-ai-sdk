import { randomUUID } from "node:crypto";

import {
  conversationMessageSchema,
  extractedMemoryCandidateSchema,
  type MemoryRecord,
} from "./schema.js";
import { renderMemoryContext } from "./render.js";
import type {
  CharacterMemoryRuntimeOptions,
  IngestInput,
  IngestResult,
  RecallInput,
  RecallResult,
} from "./types.js";

export class CharacterMemoryRuntime {
  readonly #options: Required<
    Pick<CharacterMemoryRuntimeOptions, "extractor" | "store" | "now" | "createId">
  > &
    Pick<CharacterMemoryRuntimeOptions, "embeddings"> & { minimumConfidence: number };

  constructor(options: CharacterMemoryRuntimeOptions) {
    this.#options = {
      extractor: options.extractor,
      store: options.store,
      now: options.now ?? (() => new Date()),
      createId: options.createId ?? randomUUID,
      minimumConfidence: options.minimumConfidence ?? 0.55,
      ...(options.embeddings === undefined ? {} : { embeddings: options.embeddings }),
    };
  }

  get store() {
    return this.#options.store;
  }

  async ingest(input: IngestInput): Promise<IngestResult> {
    if (input.messages.length === 0) return { created: [], merged: [] };

    const userId = input.userId ?? null;
    const messages = input.messages.map((message) =>
      conversationMessageSchema.parse({
        ...message,
        name: message.name ?? null,
        timestamp: message.timestamp ?? null,
        characterId: message.characterId ?? null,
      }),
    );
    const allowedMessageIds = new Set(messages.map((message) => message.id));
    const extracted = await this.#options.extractor.extract({
      characterId: input.characterId,
      userId,
      conversationId: input.conversationId,
      messages,
    });

    const candidates = extracted
      .map((candidate) => extractedMemoryCandidateSchema.parse(candidate))
      .map((candidate) => ({
        ...candidate,
        sourceMessageIds: candidate.sourceMessageIds.filter((id) => allowedMessageIds.has(id)),
      }))
      .filter(
        (candidate) =>
          candidate.confidence >= this.#options.minimumConfidence &&
          candidate.sourceMessageIds.length > 0,
      );

    const existing = await this.#options.store.list({
      characterId: input.characterId,
      userId,
      statuses: ["active"],
    });

    const created: MemoryRecord[] = [];
    const merged: MemoryRecord[] = [];
    const timestamp = this.#options.now().toISOString();

    for (const candidate of candidates) {
      const duplicate = existing.find(
        (memory) =>
          memory.scope === candidate.scope &&
          memory.kind === candidate.kind &&
          normalize(memory.content) === normalize(candidate.content),
      );

      if (duplicate !== undefined) {
        merged.push({
          ...duplicate,
          participants: unique([...duplicate.participants, ...candidate.participants]),
          sourceMessageIds: unique([...duplicate.sourceMessageIds, ...candidate.sourceMessageIds]),
          tags: unique([...duplicate.tags, ...candidate.tags]),
          importance: Math.max(duplicate.importance, candidate.importance),
          confidence: Math.max(duplicate.confidence, candidate.confidence),
          updatedAt: timestamp,
        });
        continue;
      }

      created.push({
        ...candidate,
        id: this.#options.createId(),
        characterId: input.characterId,
        userId,
        conversationId: input.conversationId,
        status: "active",
        supersedes: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        lastRecalledAt: null,
        recallCount: 0,
        embedding: null,
      });
    }

    if (this.#options.embeddings !== undefined && created.length > 0) {
      const vectors = await this.#options.embeddings.embed(created.map((memory) => memory.content));
      if (vectors.length !== created.length) {
        throw new Error(
          `Embedding provider returned ${vectors.length} vectors for ${created.length} memories.`,
        );
      }
      for (let index = 0; index < created.length; index += 1) {
        const vector = vectors[index];
        if (vector === undefined) throw new Error(`Missing embedding at index ${index}.`);
        created[index] = { ...created[index]!, embedding: [...vector] };
      }
    }

    await this.#options.store.upsertMany([...created, ...merged]);
    return { created, merged };
  }

  async recall(input: RecallInput): Promise<RecallResult> {
    const queryEmbedding =
      this.#options.embeddings === undefined
        ? undefined
        : (await this.#options.embeddings.embed([input.query]))[0];

    const results = await this.#options.store.search({
      text: input.query,
      characterId: input.characterId,
      userId: input.userId ?? null,
      statuses: ["active"],
      limit: input.limit ?? 20,
      now: this.#options.now(),
      ...(input.conversationId === undefined ? {} : { conversationId: input.conversationId }),
      ...(input.scopes === undefined ? {} : { scopes: input.scopes }),
      ...(input.kinds === undefined ? {} : { kinds: input.kinds }),
      ...(queryEmbedding === undefined ? {} : { embedding: queryEmbedding }),
    });

    const rendered = renderMemoryContext(
      results,
      input.tokenBudget === undefined ? {} : { tokenBudget: input.tokenBudget },
    );
    if (rendered.included.length > 0) {
      const recalledAt = this.#options.now().toISOString();
      await this.#options.store.upsertMany(
        rendered.included.map(({ memory }) => ({
          ...memory,
          lastRecalledAt: recalledAt,
          recallCount: memory.recallCount + 1,
        })),
      );
    }

    return {
      memories: rendered.included,
      context: rendered.context,
      estimatedTokens: rendered.estimatedTokens,
    };
  }
}

export function createCharacterMemoryRuntime(
  options: CharacterMemoryRuntimeOptions,
): CharacterMemoryRuntime {
  return new CharacterMemoryRuntime(options);
}

function normalize(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
