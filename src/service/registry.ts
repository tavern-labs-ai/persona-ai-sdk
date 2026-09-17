import type { PersonaManifest } from "../persona/schema.js";

export interface PersonaRegistry {
  list(tenantId: string): Promise<readonly PersonaManifest[]>;
  get(tenantId: string, personaId: string): Promise<PersonaManifest | null>;
  set(tenantId: string, persona: PersonaManifest): Promise<void>;
  delete(tenantId: string, personaId: string): Promise<boolean>;
}

export class InMemoryPersonaRegistry implements PersonaRegistry {
  readonly #personas = new Map<string, PersonaManifest>();

  async list(tenantId: string): Promise<readonly PersonaManifest[]> {
    return [...this.#personas.entries()]
      .filter(([key]) => key.startsWith(tenantId + ":"))
      .map(([, persona]) => structuredClone(persona));
  }

  async get(tenantId: string, personaId: string): Promise<PersonaManifest | null> {
    const persona = this.#personas.get(key(tenantId, personaId));
    return persona === undefined ? null : structuredClone(persona);
  }

  async set(tenantId: string, persona: PersonaManifest): Promise<void> {
    this.#personas.set(key(tenantId, persona.id), structuredClone(persona));
  }

  async delete(tenantId: string, personaId: string): Promise<boolean> {
    return this.#personas.delete(key(tenantId, personaId));
  }
}

function key(tenantId: string, personaId: string): string {
  return `${tenantId}:${personaId}`;
}
