import { randomUUID } from "node:crypto";

import { DefaultConsolidationPolicy } from "./lifecycle.js";
import { renderMemoryContext } from "./render.js";
import {
  conversationMessageSchema,
  extractedMemoryCandidateSchema,
  memoryRecordSchema,
  type MemoryRecord,
} from "./schema.js";
import type {
  CharacterMemoryRuntimeOptions,
  IngestInput,
  IngestResult,
  MemoryExport,
  MemoryFilters,
  MemoryImportResult,
  RecallInput,
  RecallResult,
  ReembedResult,
} from "./types.js";

export class CharacterMemoryRuntime {
  readonly #options: Required<
    Pick<CharacterMemoryRuntimeOptions, "extractor" | "store" | "now" | "createId">
  > &
    Pick<CharacterMemoryRuntimeOptions, "embeddings"> & { minimumConfidence: number };
  readonly #consolidation: NonNullable<CharacterMemoryRuntimeOptions["consolidation"]>;

  constructor(options: CharacterMemoryRuntimeOptions) {
    this.#options = {
      extractor: options.extractor,
      store: options.store,
      now: options.now ?? (() => new Date()),
      createId: options.createId ?? randomUUID,
      minimumConfidence: options.minimumConfidence ?? 0.55,
      ...(options.embeddings === undefined ? {} : { embeddings: options.embeddings }),
    };
    this.#consolidation = options.consolidation ?? new DefaultConsolidationPolicy();
  }

  get store() {
    return this.#options.store;
  }

  async ingest(input: IngestInput): Promise<IngestResult> {
    if (input.messages.length === 0) {
      return { created: [], merged: [], superseded: [], conflicts: [] };
    }

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

    const timestamp = this.#options.now().toISOString();
    let candidateRecords: MemoryRecord[] = candidates.map((candidate) => ({
      ...candidate,
      knownBy: unique(candidate.knownBy),
      id: this.#options.createId(),
      characterId: input.characterId,
      userId,
      conversationId: input.conversationId,
      branchId: input.branchId ?? null,
      visibility: candidate.kind === "secret" ? "character_only" : "shared",
      status: "active",
      supersedes: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastRecalledAt: null,
      recallCount: 0,
      embedding: null,
      embeddingProvider: null,
      embeddingModel: null,
    }));

    if (this.#options.embeddings !== undefined && candidateRecords.length > 0) {
      const vectors = await this.#options.embeddings.embed(
        candidateRecords.map((memory) => memory.content),
      );
      if (vectors.length !== candidateRecords.length) {
        throw new Error(
          `Embedding provider returned ${vectors.length} vectors for ${candidateRecords.length} memories.`,
        );
      }
      candidateRecords = candidateRecords.map((memory, index) => {
        const vector = vectors[index];
        if (vector === undefined) throw new Error(`Missing embedding at index ${index}.`);
        return {
          ...memory,
          embedding: [...vector],
          embeddingProvider: this.#options.embeddings!.provider,
          embeddingModel: this.#options.embeddings!.model,
        };
      });
    }

    const working = [
      ...(await this.#options.store.list({
        characterId: input.characterId,
        userId,
        statuses: ["active"],
      })),
    ];
    const created: MemoryRecord[] = [];
    const merged: MemoryRecord[] = [];
    const superseded: MemoryRecord[] = [];
    const conflicts: IngestResult["conflicts"][number][] = [];

    for (const candidate of candidateRecords) {
      const decision = await this.#consolidation.decide(candidate, working);
      const related =
        decision.existingId === undefined
          ? undefined
          : working.find((memory) => memory.id === decision.existingId);

      if (decision.action === "merge" && related !== undefined) {
        const mergedRecord: MemoryRecord = {
          ...related,
          participants: unique([...related.participants, ...candidate.participants]),
          knownBy: unique([...related.knownBy, ...candidate.knownBy]),
          sourceMessageIds: unique([...related.sourceMessageIds, ...candidate.sourceMessageIds]),
          tags: unique([...related.tags, ...candidate.tags]),
          importance: Math.max(related.importance, candidate.importance),
          confidence: Math.max(related.confidence, candidate.confidence),
          updatedAt: timestamp,
          embedding: candidate.embedding ?? related.embedding,
          embeddingProvider: candidate.embeddingProvider ?? related.embeddingProvider,
          embeddingModel: candidate.embeddingModel ?? related.embeddingModel,
        };
        merged.push(mergedRecord);
        replace(working, mergedRecord);
        continue;
      }

      if (decision.action === "supersede" && related !== undefined) {
        const retired = { ...related, status: "superseded" as const, updatedAt: timestamp };
        const replacement = { ...candidate, supersedes: related.id };
        superseded.push(retired);
        created.push(replacement);
        replace(working, retired);
        working.push(replacement);
        continue;
      }

      if (decision.action === "conflict" && related !== undefined) {
        conflicts.push({ candidate, existing: related, reason: decision.reason });
      }
      created.push(candidate);
      working.push(candidate);
    }

    await this.#options.store.upsertMany([...created, ...merged, ...superseded]);
    return { created, merged, superseded, conflicts };
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
      limit: (input.limit ?? 20) * 3,
      now: this.#options.now(),
      ...(input.conversationId === undefined ? {} : { conversationId: input.conversationId }),
      ...(input.scopes === undefined ? {} : { scopes: input.scopes }),
      ...(input.kinds === undefined ? {} : { kinds: input.kinds }),
      ...(input.branchId === undefined || input.branchId === null
        ? { branchId: null }
        : { branchIds: [null, input.branchId] }),
      ...(queryEmbedding === undefined ? {} : { embedding: queryEmbedding }),
    });

    const viewerCharacterId = input.viewerCharacterId ?? input.characterId;
    const visible = results
      .filter(({ memory }) =>
        canView(memory, viewerCharacterId, input.userId ?? null, input.includeSecrets ?? false),
      )
      .filter(
        ({ memory }, _index, all) =>
          !all.some(({ memory: other }) => other.supersedes === memory.id),
      )
      .slice(0, input.limit ?? 20);

    const rendered = renderMemoryContext(
      visible,
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

  async export(filters: MemoryFilters = {}): Promise<MemoryExport> {
    return {
      format: "character-memory-runtime",
      version: 1,
      exportedAt: this.#options.now().toISOString(),
      records: await this.#options.store.list(filters),
    };
  }

  async import(snapshot: MemoryExport, overwrite = false): Promise<MemoryImportResult> {
    if (snapshot.format !== "character-memory-runtime" || snapshot.version !== 1) {
      throw new Error("Unsupported character memory export format.");
    }
    const imported: MemoryRecord[] = [];
    let skipped = 0;
    for (const value of snapshot.records) {
      const record = memoryRecordSchema.parse(value);
      if (!overwrite && (await this.#options.store.get(record.id)) !== null) skipped += 1;
      else imported.push(record);
    }
    await this.#options.store.upsertMany(imported);
    return { imported: imported.length, skipped };
  }

  async erase(filters: MemoryFilters): Promise<number> {
    const records = await this.#options.store.list(filters);
    let deleted = 0;
    for (const record of records) if (await this.#options.store.delete(record.id)) deleted += 1;
    return deleted;
  }

  async archive(filters: MemoryFilters): Promise<number> {
    const records = await this.#options.store.list(filters);
    const timestamp = this.#options.now().toISOString();
    await this.#options.store.upsertMany(
      records.map((record) => ({ ...record, status: "archived", updatedAt: timestamp })),
    );
    return records.length;
  }

  async reembed(filters: MemoryFilters = {}): Promise<ReembedResult> {
    if (this.#options.embeddings === undefined) {
      throw new Error("Cannot re-embed memories without an embedding provider.");
    }
    const records = await this.#options.store.list(filters);
    const vectors = await this.#options.embeddings.embed(records.map((record) => record.content));
    if (vectors.length !== records.length) {
      throw new Error(
        `Embedding provider returned ${vectors.length} vectors for ${records.length} memories.`,
      );
    }
    const timestamp = this.#options.now().toISOString();
    await this.#options.store.upsertMany(
      records.map((record, index) => ({
        ...record,
        embedding: [...(vectors[index] ?? [])],
        embeddingProvider: this.#options.embeddings!.provider,
        embeddingModel: this.#options.embeddings!.model,
        updatedAt: timestamp,
      })),
    );
    return {
      updated: records.length,
      provider: this.#options.embeddings.provider,
      model: this.#options.embeddings.model,
    };
  }
}

export function createCharacterMemoryRuntime(
  options: CharacterMemoryRuntimeOptions,
): CharacterMemoryRuntime {
  return new CharacterMemoryRuntime(options);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function replace(memories: MemoryRecord[], replacement: MemoryRecord): void {
  const index = memories.findIndex((memory) => memory.id === replacement.id);
  if (index >= 0) memories[index] = replacement;
}

function canView(
  memory: MemoryRecord,
  viewerCharacterId: string,
  userId: string | null,
  includeSecrets: boolean,
): boolean {
  if (includeSecrets || memory.visibility === "shared") return true;
  if (memory.visibility === "character_only") return memory.knownBy.includes(viewerCharacterId);
  return userId !== null && memory.knownBy.includes(userId);
}
