import { randomUUID } from "node:crypto";

import type { CharacterMemoryRuntime } from "../core/runtime.js";
import { personaManifestSchema, type PersonaManifest } from "./schema.js";
import { compilePersona } from "./compiler.js";
import {
  createInitialPersonaState,
  evolvePersonaState,
  InMemoryPersonaStateStore,
} from "./state.js";
import type {
  CharacterModel,
  PersonaRespondInput,
  PersonaResponse,
  PersonaStateKey,
  PersonaStateStore,
  VoiceDelivery,
} from "./types.js";

export interface PersonaRuntimeOptions {
  persona: PersonaManifest;
  model: CharacterModel;
  memory: CharacterMemoryRuntime;
  stateStore?: PersonaStateStore;
  now?: () => Date;
  createId?: () => string;
}

export class PersonaRuntime {
  readonly persona: PersonaManifest;
  readonly #model: CharacterModel;
  readonly #memory: CharacterMemoryRuntime;
  readonly #stateStore: PersonaStateStore;
  readonly #now: () => Date;
  readonly #createId: () => string;

  constructor(options: PersonaRuntimeOptions) {
    this.persona = personaManifestSchema.parse(options.persona);
    this.#model = options.model;
    this.#memory = options.memory;
    this.#stateStore = options.stateStore ?? new InMemoryPersonaStateStore();
    this.#now = options.now ?? (() => new Date());
    this.#createId = options.createId ?? randomUUID;
  }

  async respond(input: PersonaRespondInput): Promise<PersonaResponse> {
    const key: PersonaStateKey = {
      characterId: this.persona.id,
      userId: input.userId ?? null,
      branchId: input.branchId ?? null,
    };
    const state =
      (await this.#stateStore.get(key)) ??
      createInitialPersonaState(this.persona, key, this.#now());

    const recallStarted = performance.now();
    const recalled = await this.#memory.recall({
      characterId: this.persona.id,
      userId: key.userId,
      branchId: key.branchId,
      query: input.message,
      tokenBudget: input.memoryTokenBudget ?? 1_200,
      viewerCharacterId: this.persona.id,
    });
    const recallDurationMs = performance.now() - recallStarted;

    const compiled = compilePersona({
      persona: this.persona,
      state,
      channel: input.channel ?? "text",
      memoryContext: recalled.context,
      ...(input.userName === undefined ? {} : { userName: input.userName }),
    });
    const userMessageId = input.messageId ?? this.#createId();
    const messages = [
      ...(input.history ?? []),
      { id: userMessageId, role: "user" as const, content: input.message },
    ];

    const generationStarted = performance.now();
    const generated = await this.#model.generate({
      instructions: compiled.instructions,
      messages,
      ...(input.maxOutputTokens === undefined ? {} : { maxOutputTokens: input.maxOutputTokens }),
      ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
    });
    const generationDurationMs = performance.now() - generationStarted;

    const assistantMessageId = this.#createId();
    const ingestionStarted = performance.now();
    await this.#memory.ingest({
      characterId: this.persona.id,
      userId: key.userId,
      conversationId: input.conversationId,
      branchId: key.branchId,
      messages: [
        { id: userMessageId, role: "user", content: input.message, name: input.userName ?? null },
        {
          id: assistantMessageId,
          role: "assistant",
          content: generated.text,
          name: this.persona.name,
          characterId: this.persona.id,
        },
      ],
    });
    const ingestionDurationMs = performance.now() - ingestionStarted;

    const nextState = evolvePersonaState(this.persona, state, {}, this.#now());
    await this.#stateStore.set(nextState);

    return {
      text: generated.text,
      state: nextState,
      delivery: createVoiceDelivery(this.persona, nextState),
      trace: {
        personaFingerprint: compiled.fingerprint,
        provider: this.#model.provider,
        model: this.#model.model,
        recalledMemoryIds: recalled.memories.map(({ memory }) => memory.id),
        recallDurationMs,
        generationDurationMs,
        ingestionDurationMs,
      },
      ...(generated.usage === undefined ? {} : { usage: generated.usage }),
    };
  }
}

export function createPersonaRuntime(options: PersonaRuntimeOptions): PersonaRuntime {
  return new PersonaRuntime(options);
}

function createVoiceDelivery(
  persona: PersonaManifest,
  state: PersonaResponse["state"],
): VoiceDelivery {
  return {
    emotion: state.emotion.label,
    pace: persona.voice.pace * (1 + state.emotion.arousal * 0.08),
    expressiveness: Math.min(
      1,
      persona.voice.expressiveness * (0.75 + state.emotion.intensity * 0.5),
    ),
    style: persona.voice.style,
    pauseAfterMs: Math.round(150 + (1 - state.emotion.arousal) * 250),
  };
}
