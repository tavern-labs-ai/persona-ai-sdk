import { describe, expect, it } from "vitest";

import type { MemoryExtractionInput } from "../src/core/types.js";
import { createBedrockExtractor, createBedrockTitanEmbeddings } from "../src/providers/bedrock.js";
import { createOpenAIEmbeddings, createOpenAIExtractor } from "../src/providers/openai.js";

const enabled = process.env.RUN_LIVE_PROVIDER_TESTS === "1";
const input: MemoryExtractionInput = {
  characterId: "nova",
  userId: "integration-user",
  conversationId: "integration-chat",
  messages: [
    {
      id: "live-1",
      role: "user",
      content: "My favorite tea is jasmine.",
      name: "Tester",
      timestamp: null,
      characterId: null,
    },
  ],
};

describe.skipIf(!enabled)("live provider smoke tests", () => {
  it.skipIf(!process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL)(
    "extracts and embeds through OpenAI",
    async () => {
      const memories = await createOpenAIExtractor({ model: process.env.OPENAI_MODEL! }).extract(
        input,
      );
      const vectors = await createOpenAIEmbeddings({
        model: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
      }).embed(["jasmine tea"]);
      expect(memories.length).toBeGreaterThan(0);
      expect(vectors[0]?.length).toBeGreaterThan(0);
    },
    120_000,
  );

  it.skipIf(!process.env.BEDROCK_MODEL_ID)(
    "extracts and embeds through Amazon Bedrock",
    async () => {
      const memories = await createBedrockExtractor({
        modelId: process.env.BEDROCK_MODEL_ID!,
        ...(process.env.AWS_REGION === undefined ? {} : { region: process.env.AWS_REGION }),
      }).extract(input);
      const vectors = await createBedrockTitanEmbeddings({
        ...(process.env.BEDROCK_EMBEDDING_MODEL_ID === undefined
          ? {}
          : { modelId: process.env.BEDROCK_EMBEDDING_MODEL_ID }),
        ...(process.env.AWS_REGION === undefined ? {} : { region: process.env.AWS_REGION }),
      }).embed(["jasmine tea"]);
      expect(memories.length).toBeGreaterThan(0);
      expect(vectors[0]?.length).toBeGreaterThan(0);
    },
    180_000,
  );
});
