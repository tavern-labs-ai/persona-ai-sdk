import {
  BedrockRuntimeClient,
  ConverseCommand,
  InvokeModelCommand,
  type BedrockRuntimeClientConfig,
} from "@aws-sdk/client-bedrock-runtime";
import { z } from "zod";

import { ProviderResponseError } from "../core/errors.js";
import { buildExtractionPrompt, MEMORY_EXTRACTION_INSTRUCTIONS } from "../core/prompt.js";
import { extractionJsonSchema, extractionResultSchema } from "../core/schema.js";
import type { EmbeddingProvider, MemoryExtractionInput, MemoryExtractor } from "../core/types.js";
import type { CharacterModel, CharacterModelRequest } from "../persona/types.js";

export interface BedrockExtractorOptions {
  modelId: string;
  region?: string;
  client?: BedrockRuntimeClient;
  clientConfig?: BedrockRuntimeClientConfig;
  maxTokens?: number;
  temperature?: number;
}

export interface BedrockTitanEmbeddingOptions {
  modelId?: string;
  region?: string;
  client?: BedrockRuntimeClient;
  clientConfig?: BedrockRuntimeClientConfig;
  dimensions?: 256 | 512 | 1024;
  normalize?: boolean;
}

export interface BedrockCharacterModelOptions {
  modelId: string;
  region?: string;
  client?: BedrockRuntimeClient;
  clientConfig?: BedrockRuntimeClientConfig;
}

export class BedrockMemoryExtractor implements MemoryExtractor {
  readonly provider = "bedrock";
  readonly #client: BedrockRuntimeClient;
  readonly #modelId: string;
  readonly #maxTokens: number;
  readonly #temperature: number;

  constructor(options: BedrockExtractorOptions) {
    this.#client = options.client ?? createClient(options);
    this.#modelId = options.modelId;
    this.#maxTokens = options.maxTokens ?? 4_096;
    this.#temperature = options.temperature ?? 0;
  }

  async extract(input: MemoryExtractionInput) {
    const response = await this.#client.send(
      new ConverseCommand({
        modelId: this.#modelId,
        system: [{ text: MEMORY_EXTRACTION_INSTRUCTIONS }],
        messages: [
          {
            role: "user",
            content: [{ text: buildExtractionPrompt(input) }],
          },
        ],
        inferenceConfig: {
          maxTokens: this.#maxTokens,
          temperature: this.#temperature,
        },
        outputConfig: {
          textFormat: {
            type: "json_schema",
            structure: {
              jsonSchema: {
                name: "character_memory_extraction",
                description: "Durable memories extracted from a conversation.",
                schema: JSON.stringify(extractionJsonSchema),
              },
            },
          },
        },
      }),
    );

    if (response.stopReason !== "end_turn" && response.stopReason !== "stop_sequence") {
      throw new ProviderResponseError(
        this.provider,
        `Memory extraction ended with stop reason ${response.stopReason}.`,
      );
    }

    const text = response.output?.message?.content
      ?.map((block) => block.text ?? "")
      .join("")
      .trim();
    if (text === undefined || text.length === 0) {
      throw new ProviderResponseError(this.provider, "Memory extraction returned no text.");
    }

    return parseExtraction(text, this.provider);
  }
}

const titanEmbeddingResponseSchema = z.object({
  embedding: z.array(z.number()),
  inputTextTokenCount: z.number().optional(),
});

export class BedrockTitanEmbeddingProvider implements EmbeddingProvider {
  readonly provider = "bedrock-titan";
  readonly model: string;
  readonly dimensions: 256 | 512 | 1024;
  readonly #client: BedrockRuntimeClient;
  readonly #modelId: string;
  readonly #normalize: boolean;

  constructor(options: BedrockTitanEmbeddingOptions = {}) {
    this.#client = options.client ?? createClient(options);
    this.#modelId = options.modelId ?? "amazon.titan-embed-text-v2:0";
    this.model = this.#modelId;
    this.dimensions = options.dimensions ?? 1024;
    this.#normalize = options.normalize ?? true;
  }

  async embed(texts: readonly string[]): Promise<readonly (readonly number[])[]> {
    const vectors: number[][] = [];

    // Titan embeddings accepts one input per InvokeModel request. Keep this
    // sequential by default to avoid surprising Bedrock RPM bursts.
    for (const text of texts) {
      const response = await this.#client.send(
        new InvokeModelCommand({
          modelId: this.#modelId,
          contentType: "application/json",
          accept: "application/json",
          body: new TextEncoder().encode(
            JSON.stringify({
              inputText: text,
              dimensions: this.dimensions,
              normalize: this.#normalize,
              embeddingTypes: ["float"],
            }),
          ),
        }),
      );

      const decoded = new TextDecoder().decode(response.body);
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(decoded);
      } catch (error) {
        throw new ProviderResponseError(this.provider, "Embedding output was not valid JSON.", {
          cause: error,
        });
      }

      const parsed = titanEmbeddingResponseSchema.safeParse(parsedJson);
      if (!parsed.success) {
        throw new ProviderResponseError(
          this.provider,
          `Embedding output failed validation: ${z.prettifyError(parsed.error)}`,
        );
      }
      vectors.push(parsed.data.embedding);
    }

    return vectors;
  }
}

export class BedrockCharacterModel implements CharacterModel {
  readonly provider = "bedrock";
  readonly model: string;
  readonly #client: BedrockRuntimeClient;

  constructor(options: BedrockCharacterModelOptions) {
    this.#client = options.client ?? createClient(options);
    this.model = options.modelId;
  }

  async generate(request: CharacterModelRequest) {
    const messages = request.messages
      .filter((message) => message.role === "user" || message.role === "assistant")
      .map((message) => ({
        role: message.role as "user" | "assistant",
        content: [{ text: message.content }],
      }));
    const response = await this.#client.send(
      new ConverseCommand({
        modelId: this.model,
        system: [{ text: request.instructions }],
        messages,
        inferenceConfig: {
          ...(request.maxOutputTokens === undefined ? {} : { maxTokens: request.maxOutputTokens }),
          ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
        },
      }),
    );
    if (response.stopReason !== "end_turn" && response.stopReason !== "stop_sequence") {
      throw new ProviderResponseError(
        this.provider,
        `Character generation ended with stop reason ${response.stopReason}.`,
      );
    }
    const text = response.output?.message?.content
      ?.map((block) => block.text ?? "")
      .join("")
      .trim();
    if (text === undefined || text.length === 0) {
      throw new ProviderResponseError(this.provider, "Character generation returned no text.");
    }
    return {
      text,
      finishReason: response.stopReason,
      ...(response.usage === undefined
        ? {}
        : {
            usage: {
              ...(response.usage.inputTokens === undefined
                ? {}
                : { inputTokens: response.usage.inputTokens }),
              ...(response.usage.outputTokens === undefined
                ? {}
                : { outputTokens: response.usage.outputTokens }),
            },
          }),
    };
  }
}

export function createBedrockExtractor(options: BedrockExtractorOptions): BedrockMemoryExtractor {
  return new BedrockMemoryExtractor(options);
}

export function createBedrockTitanEmbeddings(
  options: BedrockTitanEmbeddingOptions = {},
): BedrockTitanEmbeddingProvider {
  return new BedrockTitanEmbeddingProvider(options);
}

export function createBedrockCharacterModel(
  options: BedrockCharacterModelOptions,
): BedrockCharacterModel {
  return new BedrockCharacterModel(options);
}

function createClient(options: {
  region?: string;
  clientConfig?: BedrockRuntimeClientConfig;
}): BedrockRuntimeClient {
  return new BedrockRuntimeClient({
    ...options.clientConfig,
    ...(options.region === undefined ? {} : { region: options.region }),
  });
}

function parseExtraction(value: string, provider: string) {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(value);
  } catch (error) {
    throw new ProviderResponseError(provider, "Structured output was not valid JSON.", {
      cause: error,
    });
  }

  const parsed = extractionResultSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new ProviderResponseError(
      provider,
      `Structured output failed validation: ${z.prettifyError(parsed.error)}`,
    );
  }
  return parsed.data.memories;
}
