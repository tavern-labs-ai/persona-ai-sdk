import { z } from "zod";

export const memoryScopes = ["character", "user", "relationship", "conversation", "world"] as const;

export const memoryKinds = [
  "fact",
  "event",
  "preference",
  "relationship",
  "promise",
  "secret",
  "state",
  "story_arc",
] as const;

export const memoryStatuses = ["active", "superseded", "archived"] as const;

export const memoryVisibilities = ["shared", "character_only", "user_only"] as const;

export const messageRoles = ["system", "user", "assistant", "tool"] as const;

export const conversationMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(messageRoles),
  content: z.string(),
  name: z.string().min(1).nullable(),
  timestamp: z.string().datetime().nullable(),
  characterId: z.string().min(1).nullable(),
});

export const extractedMemoryCandidateSchema = z.object({
  scope: z.enum(memoryScopes),
  kind: z.enum(memoryKinds),
  content: z.string().min(1),
  participants: z.array(z.string().min(1)),
  importance: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  sourceMessageIds: z.array(z.string().min(1)).min(1),
  knownBy: z.array(z.string().min(1)),
  occurredAt: z.string().nullable(),
  validUntil: z.string().nullable(),
  tags: z.array(z.string().min(1)),
});

export const extractionResultSchema = z.object({
  memories: z.array(extractedMemoryCandidateSchema),
});

export const memoryRecordSchema = extractedMemoryCandidateSchema.extend({
  id: z.string().min(1),
  characterId: z.string().min(1),
  userId: z.string().min(1).nullable(),
  conversationId: z.string().min(1),
  branchId: z.string().min(1).nullable(),
  visibility: z.enum(memoryVisibilities),
  status: z.enum(memoryStatuses),
  supersedes: z.string().min(1).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastRecalledAt: z.string().datetime().nullable(),
  recallCount: z.number().int().nonnegative(),
  embedding: z.array(z.number()).nullable(),
  embeddingProvider: z.string().min(1).nullable(),
  embeddingModel: z.string().min(1).nullable(),
});

/**
 * Provider-neutral schema accepted by both OpenAI Structured Outputs and
 * Amazon Bedrock structured output. Keep this deliberately conservative.
 */
export const extractionJsonSchema = {
  type: "object",
  properties: {
    memories: {
      type: "array",
      items: {
        type: "object",
        properties: {
          scope: { type: "string", enum: memoryScopes },
          kind: { type: "string", enum: memoryKinds },
          content: {
            type: "string",
            description: "A concise, standalone memory written as a factual statement.",
          },
          participants: {
            type: "array",
            items: { type: "string" },
            description: "Names or stable identifiers of entities involved in the memory.",
          },
          importance: {
            type: "number",
            description: "Importance from 0 to 1.",
          },
          confidence: {
            type: "number",
            description: "Confidence that the conversation supports this memory, from 0 to 1.",
          },
          sourceMessageIds: {
            type: "array",
            items: { type: "string" },
            description: "IDs of messages that directly support the memory.",
          },
          knownBy: {
            type: "array",
            items: { type: "string" },
            description:
              "Characters or users who know this information. For secrets, omit entities who do not know it.",
          },
          occurredAt: {
            type: ["string", "null"],
            description: "ISO date/time or narrative time when known; otherwise null.",
          },
          validUntil: {
            type: ["string", "null"],
            description: "Expiry date/time when explicitly known; otherwise null.",
          },
          tags: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: [
          "scope",
          "kind",
          "content",
          "participants",
          "importance",
          "confidence",
          "sourceMessageIds",
          "knownBy",
          "occurredAt",
          "validUntil",
          "tags",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["memories"],
  additionalProperties: false,
} as const;

export type ConversationMessage = z.infer<typeof conversationMessageSchema>;
export type ExtractedMemoryCandidate = z.infer<typeof extractedMemoryCandidateSchema>;
export type ExtractionResult = z.infer<typeof extractionResultSchema>;
export type MemoryRecord = z.infer<typeof memoryRecordSchema>;
export type MemoryScope = (typeof memoryScopes)[number];
export type MemoryKind = (typeof memoryKinds)[number];
export type MemoryStatus = (typeof memoryStatuses)[number];
export type MemoryVisibility = (typeof memoryVisibilities)[number];
export type MessageRole = (typeof messageRoles)[number];
