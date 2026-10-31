/**
 * Bundled persona ids shipped with `persona-ai-sdk`.
 */
export type PersonaId = "atlas" | "sage" | "vera" | "scout" | "wren" | "ember" | "lumen" | "mica";

export interface PersonaMemorySeed {
  content: string;
  importance: number;
}

export interface PersonaCard {
  id: PersonaId;
  name: string;
  tagline: string;
  description: string;
  traits: Readonly<Record<string, string>>;
  systemPrompt: string;
  greeting: string;
  memorySeeds: readonly PersonaMemorySeed[];
  suggestedModel: string;
  version: string;
  author: string;
}

/**
 * Minimal catalog entry returned by `listPersonas()`.
 */
export interface PersonaSummary {
  id: PersonaId;
  name: string;
  tagline: string;
}

/** All bundled persona cards, keyed by id. */
export declare const personas: Readonly<Record<PersonaId, PersonaCard>>;

/** Personas enabled by default (`["atlas", "sage"]`). */
export declare const DEFAULT_PERSONAS: readonly PersonaId[];

/** List every bundled persona without loading full cards. */
export declare function listPersonas(): readonly PersonaSummary[];

/** Every bundled persona id, in catalog order. */
export declare function personaIds(): readonly PersonaId[];

/**
 * Get a bundled persona card by id. Falls back to the first default persona
 * (`atlas`) when the id is unknown.
 */
export declare function getPersona(id: string): PersonaCard;
