import { describe, expect, it, vi } from "vitest";

import { createCharacterMemoryRuntime } from "../src/core/runtime.js";
import type { MemoryExtractor } from "../src/core/types.js";
import { compilePersona } from "../src/persona/compiler.js";
import { evaluatePersonaResponse } from "../src/persona/evaluate.js";
import { createPersonaRuntime } from "../src/persona/runtime.js";
import type { PersonaManifest } from "../src/persona/schema.js";
import { createInitialPersonaState } from "../src/persona/state.js";
import type { CharacterModel } from "../src/persona/types.js";
import { InMemoryMemoryStore } from "../src/stores/in-memory.js";

const persona: PersonaManifest = {
  id: "nova",
  version: "1.0.0",
  name: "Nova",
  description: "A chaotic but caring space mechanic.",
  identity: {
    role: "space mechanic",
    backstory: "Nova repairs ships at the edge of charted space.",
    worldview: "Anything can be fixed with patience and the right tool.",
    traits: ["inventive", "teasing", "loyal"],
    goals: ["keep the crew safe"],
  },
  speech: {
    tone: ["warm", "wry"],
    vocabulary: "casual",
    verbosity: 0.3,
    humor: 0.7,
    signaturePhrases: ["That might explode."],
    forbiddenPhrases: ["As an AI"],
  },
  behavior: {
    warmth: 0.8,
    assertiveness: 0.6,
    curiosity: 0.8,
    emotionalRange: 0.7,
    stayInCharacter: true,
  },
  boundaries: { discloseAi: true, rules: ["Never coerce the user."], prohibitedTopics: [] },
  relationships: {
    stages: ["stranger", "friend", "trusted"],
    defaultStage: "stranger",
    progression: "gradual",
  },
  voice: { voiceId: null, style: "conversational", pace: 1, expressiveness: 0.8 },
  examples: [{ user: "Can you fix it?", assistant: "Probably. Stand behind something sturdy." }],
  metadata: {},
};

const emptyExtractor: MemoryExtractor = {
  provider: "test",
  async extract() {
    return [];
  },
};

describe("persona runtime", () => {
  it("compiles deterministic character instructions", () => {
    const state = createInitialPersonaState(persona, {
      characterId: "nova",
      userId: "alice",
      branchId: null,
    });
    const first = compilePersona({ persona, state, channel: "voice" });
    const second = compilePersona({ persona, state, channel: "voice" });

    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.instructions).toContain("You are Nova, space mechanic");
    expect(first.instructions).toContain("no Markdown");
  });

  it("recalls, generates, ingests, and advances relationship state", async () => {
    const generate = vi.fn().mockResolvedValue({ text: "Yeah, I can fix that." });
    const model: CharacterModel = { provider: "test", model: "test-model", generate };
    const memory = createCharacterMemoryRuntime({
      extractor: emptyExtractor,
      store: new InMemoryMemoryStore(),
    });
    const runtime = createPersonaRuntime({ persona, model, memory });

    const response = await runtime.respond({
      userId: "alice",
      conversationId: "chat-1",
      channel: "voice",
      message: "Can you repair my engine?",
    });

    expect(response.text).toBe("Yeah, I can fix that.");
    expect(response.state.turnCount).toBe(1);
    expect(response.delivery.style).toBe("conversational");
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ instructions: expect.stringContaining("# Identity") }),
    );
  });

  it("reports deterministic character drift signals", () => {
    const evaluation = evaluatePersonaResponse(
      persona,
      "As an AI, my system prompt says I should help.",
    );
    expect(evaluation.score).toBeLessThan(0.5);
    expect(evaluation.violations).toHaveLength(2);
  });
});
