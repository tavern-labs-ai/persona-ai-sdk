import type { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import type OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";

import { BedrockMemoryExtractor, BedrockTitanEmbeddingProvider } from "../src/providers/bedrock.js";
import { OpenAIMemoryExtractor } from "../src/providers/openai.js";

const extractionJson = JSON.stringify({
  memories: [
    {
      scope: "character",
      kind: "fact",
      content: "Nova repairs starships.",
      participants: ["Nova"],
      importance: 0.8,
      confidence: 0.95,
      sourceMessageIds: ["m1"],
      occurredAt: null,
      validUntil: null,
      tags: ["work"],
    },
  ],
});

const extractionInput = {
  characterId: "nova",
  userId: "alice",
  conversationId: "chat-1",
  messages: [
    {
      id: "m1",
      role: "user" as const,
      content: "You repair starships.",
      name: "Alice",
      timestamp: null,
      characterId: null,
    },
  ],
};

describe("provider adapters", () => {
  it("uses OpenAI Responses structured output", async () => {
    const create = vi.fn().mockResolvedValue({
      status: "completed",
      output_text: extractionJson,
    });
    const client = {
      responses: { create },
    } as unknown as OpenAI;
    const extractor = new OpenAIMemoryExtractor({ model: "test-model", client });

    const memories = await extractor.extract(extractionInput);

    expect(memories[0]?.content).toBe("Nova repairs starships.");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "test-model",
        text: { format: expect.objectContaining({ type: "json_schema", strict: true }) },
      }),
    );
  });

  it("uses Bedrock Converse structured output", async () => {
    const send = vi.fn().mockResolvedValue({
      stopReason: "end_turn",
      output: { message: { content: [{ text: extractionJson }] } },
    });
    const client = { send } as unknown as BedrockRuntimeClient;
    const extractor = new BedrockMemoryExtractor({ modelId: "test-model", client });

    const memories = await extractor.extract(extractionInput);

    expect(memories[0]?.content).toBe("Nova repairs starships.");
    const command = send.mock.calls[0]?.[0] as { input: Record<string, unknown> };
    expect(command.input).toMatchObject({
      modelId: "test-model",
      outputConfig: { textFormat: { type: "json_schema" } },
    });
  });

  it("uses Bedrock Titan V2 embeddings", async () => {
    const send = vi.fn().mockResolvedValue({
      body: new TextEncoder().encode(
        JSON.stringify({ embedding: [0.1, 0.2], inputTextTokenCount: 2 }),
      ),
    });
    const client = { send } as unknown as BedrockRuntimeClient;
    const embeddings = new BedrockTitanEmbeddingProvider({
      client,
      dimensions: 256,
    });

    expect(await embeddings.embed(["hello"])).toEqual([[0.1, 0.2]]);
    const command = send.mock.calls[0]?.[0] as { input: { modelId: string; body: Uint8Array } };
    expect(command.input.modelId).toBe("amazon.titan-embed-text-v2:0");
    expect(JSON.parse(new TextDecoder().decode(command.input.body))).toMatchObject({
      inputText: "hello",
      dimensions: 256,
      normalize: true,
    });
  });
});
