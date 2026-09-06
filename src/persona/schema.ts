import { z } from "zod";

export const personaChannelSchema = z.enum(["text", "voice", "game", "social"]);

export const personaManifestSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  identity: z.object({
    role: z.string().min(1),
    backstory: z.string(),
    worldview: z.string(),
    traits: z.array(z.string().min(1)),
    goals: z.array(z.string().min(1)),
  }),
  speech: z.object({
    tone: z.array(z.string().min(1)),
    vocabulary: z.enum(["simple", "casual", "neutral", "technical", "literary"]),
    verbosity: z.number().min(0).max(1),
    humor: z.number().min(0).max(1),
    signaturePhrases: z.array(z.string()),
    forbiddenPhrases: z.array(z.string()),
  }),
  behavior: z.object({
    warmth: z.number().min(0).max(1),
    assertiveness: z.number().min(0).max(1),
    curiosity: z.number().min(0).max(1),
    emotionalRange: z.number().min(0).max(1),
    stayInCharacter: z.boolean(),
  }),
  boundaries: z.object({
    discloseAi: z.boolean(),
    rules: z.array(z.string().min(1)),
    prohibitedTopics: z.array(z.string().min(1)),
  }),
  relationships: z.object({
    stages: z.array(z.string().min(1)).min(1),
    defaultStage: z.string().min(1),
    progression: z.enum(["manual", "gradual", "dynamic"]),
  }),
  voice: z.object({
    voiceId: z.string().min(1).nullable(),
    style: z.string().min(1),
    pace: z.number().positive(),
    expressiveness: z.number().min(0).max(1),
  }),
  examples: z.array(
    z.object({
      user: z.string(),
      assistant: z.string(),
    }),
  ),
  metadata: z.record(z.string(), z.string()),
});

export const relationshipStateSchema = z.object({
  trust: z.number().min(0).max(1),
  familiarity: z.number().min(0).max(1),
  affection: z.number().min(0).max(1),
  tension: z.number().min(0).max(1),
});

export const emotionalStateSchema = z.object({
  label: z.string().min(1),
  valence: z.number().min(-1).max(1),
  arousal: z.number().min(0).max(1),
  intensity: z.number().min(0).max(1),
});

export const personaStateSchema = z.object({
  characterId: z.string().min(1),
  userId: z.string().min(1).nullable(),
  branchId: z.string().min(1).nullable(),
  relationshipStage: z.string().min(1),
  relationship: relationshipStateSchema,
  emotion: emotionalStateSchema,
  turnCount: z.number().int().nonnegative(),
  updatedAt: z.string().datetime(),
});

export type PersonaManifest = z.infer<typeof personaManifestSchema>;
export type PersonaChannel = z.infer<typeof personaChannelSchema>;
export type PersonaState = z.infer<typeof personaStateSchema>;
export type RelationshipState = z.infer<typeof relationshipStateSchema>;
export type EmotionalState = z.infer<typeof emotionalStateSchema>;
