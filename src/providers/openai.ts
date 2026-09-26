import OpenAI from "openai";
import { z } from "zod";

import { ProviderResponseError } from "../core/errors.js";
import { buildExtractionPrompt, MEMORY_EXTRACTION_INSTRUCTIONS } from "../core/prompt.js";
import { extractionJsonSchema, extractionResultSchema } from "../core/schema.js";
import type { EmbeddingProvider, MemoryExtractionInput, MemoryExtractor } from "../core/types.js";
import type { CharacterModel, CharacterModelRequest } from "../persona/types.js";

export interface OpenAIExtractorOptions {
  model: string;
  client?: OpenAI;
  apiKey?: string;
  baseURL?: string;
}

export interface OpenAIEmbeddingOptions {
  model: string;
  dimensions?: number;
  client?: OpenAI;
  apiKey?: string;
  baseURL?: string;
}

export interface OpenAICharacterModelOptions {
  model: string;
  client?: OpenAI;
  apiKey?: string;
  baseURL?: string;
  store?: boolean;
}

export class OpenAIMemoryExtractor implements MemoryExtractor {
  readonly provider = "openai";
  readonly #client: OpenAI;
  readonly #model: string;

  constructor(options: OpenAIExtractorOptions) {
    this.#client = options.client ?? createClient(options);
    this.#model = options.model;
  }

  async extract(input: MemoryExtractionInput) {
    const response = await this.#client.responses.create({
      model: this.#model,
      instructions: MEMORY_EXTRACTION_INSTRUCTIONS,
      input: buildExtractionPrompt(input),
      store: false,
      text: {
        format: {
          type: "json_schema",
          name: "character_memory_extraction",
          description: "Durable memories extracted from a conversation.",
          strict: true,
          schema: extractionJsonSchema,
        },
      },
    });

    if (response.status !== "completed") {
      throw new ProviderResponseError(
        this.provider,
        `Memory extraction ended with status ${response.status}.`,
      );
    }
    if (response.output_text.length === 0) {
      throw new ProviderResponseError(this.provider, "Memory extraction returned no text.");
    }

    return parseExtraction(response.output_text, this.provider);
  }
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly provider = "openai";
  readonly model: string;
  readonly dimensions: number | undefined;
  readonly #client: OpenAI;
  readonly #model: string;

  constructor(options: OpenAIEmbeddingOptions) {
    this.#client = options.client ?? createClient(options);
    this.#model = options.model;
    this.model = options.model;
    this.dimensions = options.dimensions;
  }

  async embed(texts: readonly string[]): Promise<readonly (readonly number[])[]> {
    if (texts.length === 0) return [];

    const response = await this.#client.embeddings.create({
      model: this.#model,
      input: [...texts],
      encoding_format: "float",
      ...(this.dimensions === undefined ? {} : { dimensions: this.dimensions }),
    });

    return [...response.data]
      .sort((left, right) => left.index - right.index)
      .map((item) => item.embedding);
  }
}

export class OpenAICharacterModel implements CharacterModel {
  readonly provider = "openai";
  readonly model: string;
  readonly #client: OpenAI;
  readonly #store: boolean;

  constructor(options: OpenAICharacterModelOptions) {
    this.#client = options.client ?? createClient(options);
    this.model = options.model;
    this.#store = options.store ?? false;
  }

  async generate(request: CharacterModelRequest) {
    const input: OpenAI.Responses.ResponseInput = request.messages.map((message) => ({
      role:
        message.role === "system" ? "developer" : message.role === "tool" ? "user" : message.role,
      content: message.role === "tool" ? `[Tool result]\n${message.content}` : message.content,
    }));
    const response = await this.#client.responses.create({
      model: this.model,
      instructions: request.instructions,
      input,
      store: this.#store,
      ...(request.maxOutputTokens === undefined
        ? {}
        : { max_output_tokens: request.maxOutputTokens }),
      ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
    });
    if (response.status !== "completed" || response.output_text.length === 0) {
      throw new ProviderResponseError(
        this.provider,
        `Character generation ended with status ${response.status}.`,
      );
    }
    return {
      text: response.output_text,
      finishReason: response.status,
      ...(response.usage === undefined
        ? {}
        : {
            usage: {
              inputTokens: response.usage.input_tokens,
              outputTokens: response.usage.output_tokens,
            },
          }),
    };
  }
}

export function createOpenAIExtractor(options: OpenAIExtractorOptions): OpenAIMemoryExtractor {
  return new OpenAIMemoryExtractor(options);
}

export function createOpenAIEmbeddings(options: OpenAIEmbeddingOptions): OpenAIEmbeddingProvider {
  return new OpenAIEmbeddingProvider(options);
}

export function createOpenAICharacterModel(
  options: OpenAICharacterModelOptions,
): OpenAICharacterModel {
  return new OpenAICharacterModel(options);
}

function createClient(options: { apiKey?: string; baseURL?: string }): OpenAI {
  return new OpenAI({
    ...(options.apiKey === undefined ? {} : { apiKey: options.apiKey }),
    ...(options.baseURL === undefined ? {} : { baseURL: options.baseURL }),
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
