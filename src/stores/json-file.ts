import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";

import { StoreFormatError } from "../core/errors.js";
import { memoryRecordSchema, type MemoryRecord } from "../core/schema.js";
import type {
  MemoryFilters,
  MemorySearchQuery,
  MemorySearchResult,
  MemoryStore,
} from "../core/types.js";
import { InMemoryMemoryStore } from "./in-memory.js";

const fileSchema = z.object({
  version: z.literal(1),
  records: z.array(memoryRecordSchema),
});

export interface JsonFileMemoryStoreOptions {
  path: string;
  pretty?: boolean;
}

/**
 * Small, local-first reference store. Writes are serialized and committed with
 * a temporary-file rename so readers never observe a partially written file.
 */
export class JsonFileMemoryStore implements MemoryStore {
  readonly kind = "json-file";
  readonly path: string;
  readonly #pretty: boolean;
  readonly #memory = new InMemoryMemoryStore();
  #loaded: Promise<void> | undefined;
  #writeQueue: Promise<void> = Promise.resolve();

  constructor(options: JsonFileMemoryStoreOptions) {
    this.path = resolve(options.path);
    this.#pretty = options.pretty ?? true;
  }

  async upsert(memory: MemoryRecord): Promise<void> {
    await this.#mutate(async () => this.#memory.upsert(memory));
  }

  async upsertMany(memories: readonly MemoryRecord[]): Promise<void> {
    await this.#mutate(async () => this.#memory.upsertMany(memories));
  }

  async get(id: string): Promise<MemoryRecord | null> {
    await this.#awaitLatest();
    return this.#memory.get(id);
  }

  async delete(id: string): Promise<boolean> {
    return this.#mutate(async () => this.#memory.delete(id));
  }

  async list(filters: MemoryFilters = {}): Promise<readonly MemoryRecord[]> {
    await this.#awaitLatest();
    return this.#memory.list(filters);
  }

  async search(query: MemorySearchQuery): Promise<readonly MemorySearchResult[]> {
    await this.#awaitLatest();
    return this.#memory.search(query);
  }

  async #mutate<T>(operation: () => Promise<T>): Promise<T> {
    let result: T | undefined;
    const queued = this.#writeQueue.then(async () => {
      await this.#ensureLoaded();
      result = await operation();
      await this.#flush();
    });

    this.#writeQueue = queued.catch(() => undefined);
    await queued;
    return result as T;
  }

  async #awaitLatest(): Promise<void> {
    await this.#writeQueue;
    await this.#ensureLoaded();
  }

  async #ensureLoaded(): Promise<void> {
    this.#loaded ??= this.#load();
    return this.#loaded;
  }

  async #load(): Promise<void> {
    let contents: string;
    try {
      contents = await readFile(this.path, "utf8");
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") return;
      throw error;
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(contents);
    } catch (error) {
      throw new StoreFormatError(`Memory store at ${this.path} is not valid JSON.`, {
        cause: error,
      });
    }

    const parsed = fileSchema.safeParse(parsedJson);
    if (!parsed.success) {
      throw new StoreFormatError(
        `Memory store at ${this.path} does not match format version 1: ${z.prettifyError(parsed.error)}`,
      );
    }

    await this.#memory.upsertMany(parsed.data.records);
  }

  async #flush(): Promise<void> {
    const records = await this.#memory.list();
    const payload = JSON.stringify({ version: 1, records }, null, this.#pretty ? 2 : undefined);
    const directory = dirname(this.path);
    const temporaryPath = `${this.path}.tmp-${process.pid}-${Date.now()}`;

    await mkdir(directory, { recursive: true });
    await writeFile(temporaryPath, `${payload}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, this.path);
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
