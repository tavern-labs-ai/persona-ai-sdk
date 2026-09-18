import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";

import { personaManifestSchema, type PersonaManifest } from "../persona/schema.js";
import type { PersonaRegistry } from "./registry.js";

const registrySchema = z.object({
  version: z.literal(1),
  tenants: z.record(z.string(), z.record(z.string(), personaManifestSchema)),
});

export class JsonFilePersonaRegistry implements PersonaRegistry {
  readonly path: string;
  #data: z.infer<typeof registrySchema> | undefined;
  #queue: Promise<void> = Promise.resolve();

  constructor(path: string) {
    this.path = resolve(path);
  }

  async list(tenantId: string): Promise<readonly PersonaManifest[]> {
    await this.#latest();
    return Object.values(this.#data!.tenants[tenantId] ?? {}).map((persona) =>
      structuredClone(persona),
    );
  }

  async get(tenantId: string, personaId: string): Promise<PersonaManifest | null> {
    await this.#latest();
    const persona = this.#data!.tenants[tenantId]?.[personaId];
    return persona === undefined ? null : structuredClone(persona);
  }

  async set(tenantId: string, persona: PersonaManifest): Promise<void> {
    await this.#mutate(() => {
      const tenant = (this.#data!.tenants[tenantId] ??= {});
      tenant[persona.id] = structuredClone(persona);
    });
  }

  async delete(tenantId: string, personaId: string): Promise<boolean> {
    let deleted = false;
    await this.#mutate(() => {
      const tenant = this.#data!.tenants[tenantId];
      if (tenant !== undefined && personaId in tenant) {
        delete tenant[personaId];
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
      await this.#flush();
    });
    this.#queue = next.catch(() => undefined);
    return next;
  }

  async #load(): Promise<void> {
    if (this.#data !== undefined) return;
    try {
      const value: unknown = JSON.parse(await readFile(this.path, "utf8"));
      this.#data = registrySchema.parse(value);
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        this.#data = { version: 1, tenants: {} };
        return;
      }
      throw error;
    }
  }

  async #flush(): Promise<void> {
    const temporary = `${this.path}.tmp-${process.pid}-${Date.now()}`;
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(temporary, JSON.stringify(this.#data, null, 2) + "\n", { mode: 0o600 });
    await rename(temporary, this.path);
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
