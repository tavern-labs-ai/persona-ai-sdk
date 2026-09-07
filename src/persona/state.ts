import type { PersonaManifest, PersonaState, RelationshipState } from "./schema.js";
import type { PersonaStateKey, PersonaStateStore } from "./types.js";

export class InMemoryPersonaStateStore implements PersonaStateStore {
  readonly #states = new Map<string, PersonaState>();

  async get(key: PersonaStateKey): Promise<PersonaState | null> {
    const state = this.#states.get(serializeKey(key));
    return state === undefined ? null : structuredClone(state);
  }

  async set(state: PersonaState): Promise<void> {
    this.#states.set(serializeKey(state), structuredClone(state));
  }

  async delete(key: PersonaStateKey): Promise<boolean> {
    return this.#states.delete(serializeKey(key));
  }
}

export function createInitialPersonaState(
  persona: PersonaManifest,
  key: PersonaStateKey,
  now = new Date(),
): PersonaState {
  return {
    ...key,
    relationshipStage: persona.relationships.defaultStage,
    relationship: { trust: 0.2, familiarity: 0, affection: 0, tension: 0 },
    emotion: { label: "neutral", valence: 0, arousal: 0.2, intensity: 0.2 },
    turnCount: 0,
    updatedAt: now.toISOString(),
  };
}

export function evolvePersonaState(
  persona: PersonaManifest,
  state: PersonaState,
  relationshipDelta: Partial<RelationshipState> = {},
  now = new Date(),
): PersonaState {
  const relationship = {
    trust: clamp(state.relationship.trust + (relationshipDelta.trust ?? 0.005)),
    familiarity: clamp(state.relationship.familiarity + (relationshipDelta.familiarity ?? 0.015)),
    affection: clamp(state.relationship.affection + (relationshipDelta.affection ?? 0)),
    tension: clamp(state.relationship.tension + (relationshipDelta.tension ?? -0.01)),
  };
  const relationshipStage = selectStage(persona, relationship.familiarity);

  return {
    ...state,
    relationship,
    relationshipStage,
    emotion: {
      ...state.emotion,
      intensity: clamp(state.emotion.intensity * 0.85),
      arousal: clamp(state.emotion.arousal * 0.9),
    },
    turnCount: state.turnCount + 1,
    updatedAt: now.toISOString(),
  };
}

function selectStage(persona: PersonaManifest, familiarity: number): string {
  if (persona.relationships.progression === "manual") return persona.relationships.defaultStage;
  const stages = persona.relationships.stages;
  const index = Math.min(stages.length - 1, Math.floor(familiarity * stages.length));
  return stages[index] ?? persona.relationships.defaultStage;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function serializeKey(key: PersonaStateKey): string {
  return JSON.stringify([key.characterId, key.userId, key.branchId]);
}
