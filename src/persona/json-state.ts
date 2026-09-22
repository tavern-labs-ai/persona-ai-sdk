import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";

import { personaStateSchema, type PersonaState } from "./schema.js";
import type { PersonaStateKey, PersonaStateStore } from "./types.js";

const stateFileSchema = z.object({
  version: z.literal(1),
  states: z.record(z.string(), personaStateSchema),
});

/** Atomic local persistence for relationship and emotional state. */
export class JsonFilePersonaStateStore implements PersonaStateStore {
  readonly path: string;
  #data: z.infer<typeof stateFileSchema> | undefined;
  #queue: Promise<void> = Promise.resolve();

  constructor(path: string) {
    this.path = resolve(path);
  }

  async get(key: PersonaStateKey): Promise<PersonaState | null> {
    await this.#latest();
    const state = this.#data!.states[serialize(key)];
    return state === undefined ? null : structuredClone(state);
  }

  async set(state: PersonaState): Promise<void> {
    await this.#mutate(() => {
      this.#data!.states[serialize(state)] = personaStateSchema.parse(structuredClone(state));
    });
  }

  async delete(key: PersonaStateKey): Promise<boolean> {
    let deleted = false;
    await this.#mutate(() => {
      const serialized = serialize(key);
      if (serialized in this.#data!.states) {
        delete this.#data!.states[serialized];
        deleted = true;
      }
    });
    return deleted;
  }

  async #latest(): Promise<void> {
    await this.#queue;
    await this.#load();
  }

  async #mutate(operation: () => void): Promise<void> {
    const next = this.#queue.then(async () => {
      await this.#load();
      operation();
      const temporary = `${this.path}.tmp-${process.pid}-${Date.now()}`;
      await mkdir(dirname(this.path), { recursive: true });
      await writeFile(temporary, JSON.stringify(this.#data, null, 2) + "\n", { mode: 0o600 });
      await rename(temporary, this.path);
    });
    this.#queue = next.catch(() => undefined);
    return next;
  }

  async #load(): Promise<void> {
    if (this.#data !== undefined) return;
    try {
      const value: unknown = JSON.parse(await readFile(this.path, "utf8"));
      this.#data = stateFileSchema.parse(value);
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        this.#data = { version: 1, states: {} };
        return;
      }
      throw error;
    }
  }
}

function serialize(key: PersonaStateKey): string {
  return JSON.stringify([key.characterId, key.userId, key.branchId]);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
