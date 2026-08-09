import type { MemoryRecord } from "../core/schema.js";
import { matchesFilters, scoreMemory } from "../core/scoring.js";
import type {
  MemoryFilters,
  MemorySearchQuery,
  MemorySearchResult,
  MemoryStore,
} from "../core/types.js";

export class InMemoryMemoryStore implements MemoryStore {
  readonly kind = "memory";
  readonly #records = new Map<string, MemoryRecord>();

  constructor(initialRecords: readonly MemoryRecord[] = []) {
    for (const record of initialRecords) this.#records.set(record.id, clone(record));
  }

  async upsert(memory: MemoryRecord): Promise<void> {
    this.#records.set(memory.id, clone(memory));
  }

  async upsertMany(memories: readonly MemoryRecord[]): Promise<void> {
    for (const memory of memories) this.#records.set(memory.id, clone(memory));
  }

  async get(id: string): Promise<MemoryRecord | null> {
    const record = this.#records.get(id);
    return record === undefined ? null : clone(record);
  }

  async delete(id: string): Promise<boolean> {
    return this.#records.delete(id);
  }

  async list(filters: MemoryFilters = {}): Promise<readonly MemoryRecord[]> {
    return [...this.#records.values()]
      .filter((record) => matchesFilters(record, filters))
      .map(clone);
  }

  async search(query: MemorySearchQuery): Promise<readonly MemorySearchResult[]> {
    const now = query.now ?? new Date();
    const limit = Math.max(0, query.limit ?? 10);

    return [...this.#records.values()]
      .filter((memory) => matchesFilters(memory, query))
      .filter(
        (memory) => memory.validUntil === null || Date.parse(memory.validUntil) > now.getTime(),
      )
      .map((memory) => {
        const scored = scoreMemory(memory, query.text, query.embedding, now);
        return { memory: clone(memory), ...scored };
      })
      .sort(
        (left, right) => right.score - left.score || left.memory.id.localeCompare(right.memory.id),
      )
      .slice(0, limit);
  }
}

function clone(memory: MemoryRecord): MemoryRecord {
  return structuredClone(memory);
}
