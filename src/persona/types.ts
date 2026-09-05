import type { IngestMessage } from "../core/types.js";
import type { PersonaChannel, PersonaManifest, PersonaState } from "./schema.js";

export interface CharacterModelRequest {
  instructions: string;
  messages: readonly IngestMessage[];
  maxOutputTokens?: number;
  temperature?: number;
}

export interface CharacterModelUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface CharacterModelResponse {
  text: string;
  finishReason?: string;
  usage?: CharacterModelUsage;
}

export interface CharacterModel {
  readonly provider: string;
  readonly model: string;
  generate(request: CharacterModelRequest): Promise<CharacterModelResponse>;
}

export interface PersonaStateKey {
  characterId: string;
  userId: string | null;
  branchId: string | null;
}

export interface PersonaStateStore {
  get(key: PersonaStateKey): Promise<PersonaState | null>;
  set(state: PersonaState): Promise<void>;
  delete(key: PersonaStateKey): Promise<boolean>;
}

export interface CompilePersonaInput {
  persona: PersonaManifest;
  state: PersonaState;
  channel: PersonaChannel;
  memoryContext?: string;
  userName?: string;
}

export interface CompiledPersona {
  instructions: string;
  fingerprint: string;
}

export interface PersonaRespondInput {
  userId?: string | null;
  userName?: string;
  conversationId: string;
  branchId?: string | null;
  channel?: PersonaChannel;
  message: string;
  messageId?: string;
  history?: readonly IngestMessage[];
  maxOutputTokens?: number;
  temperature?: number;
  memoryTokenBudget?: number;
}

export interface VoiceDelivery {
  emotion: string;
  pace: number;
  expressiveness: number;
  style: string;
  pauseAfterMs: number;
}

export interface PersonaResponseTrace {
  personaFingerprint: string;
  provider: string;
  model: string;
  recalledMemoryIds: readonly string[];
  recallDurationMs: number;
  generationDurationMs: number;
  ingestionDurationMs: number;
}

export interface PersonaResponse {
  text: string;
  state: PersonaState;
  delivery: VoiceDelivery;
  trace: PersonaResponseTrace;
  usage?: CharacterModelUsage;
}
