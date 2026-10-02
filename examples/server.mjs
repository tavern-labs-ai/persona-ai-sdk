import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";

import { createCharacterMemoryRuntime } from "../dist/index.js";
import {
  createBedrockCharacterModel,
  createBedrockExtractor,
  createBedrockTitanEmbeddings,
} from "../dist/providers/bedrock.js";
import {
  createOpenAICharacterModel,
  createOpenAIEmbeddings,
  createOpenAIExtractor,
} from "../dist/providers/openai.js";
import { createPersonaRuntime, JsonFilePersonaStateStore } from "../dist/persona/index.js";
import {
  createCharacterApi,
  createNodeHandler,
  JsonFilePersonaRegistry,
} from "../dist/service/index.js";
import { SQLiteMemoryStore } from "../dist/stores/sqlite.js";

const dataDirectory = join(process.cwd(), "data");
mkdirSync(dataDirectory, { recursive: true });
const memories = new Map();
const provider = process.env.CHARACTER_PROVIDER ?? "openai";

function providerAdapters() {
  if (provider === "bedrock") {
    const region = process.env.AWS_REGION ?? "us-east-1";
    return {
      extractor: createBedrockExtractor({ region, modelId: required("BEDROCK_MODEL_ID") }),
      embeddings: createBedrockTitanEmbeddings({ region }),
      model: createBedrockCharacterModel({ region, modelId: required("BEDROCK_MODEL_ID") }),
    };
  }
  return {
    extractor: createOpenAIExtractor({ model: required("OPENAI_MODEL") }),
    embeddings: createOpenAIEmbeddings({
      model: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
    }),
    model: createOpenAICharacterModel({ model: required("OPENAI_MODEL") }),
  };
}

function getMemory({ tenantId, personaId }) {
  const key = `${tenantId}:${personaId}`;
  let runtime = memories.get(key);
  if (!runtime) {
    const id = createHash("sha256").update(key).digest("hex");
    const adapters = providerAdapters();
    runtime = createCharacterMemoryRuntime({
      extractor: adapters.extractor,
      embeddings: adapters.embeddings,
      store: new SQLiteMemoryStore({ path: join(dataDirectory, `${id}.sqlite`) }),
    });
    memories.set(key, runtime);
  }
  return runtime;
}

const api = createCharacterApi({
  apiKeys: parseApiKeys(required("CHARACTER_MEMORY_API_KEYS")),
  corsOrigins: "*",
  registry: new JsonFilePersonaRegistry(join(dataDirectory, "personas.json")),
  getMemory,
  createRuntime({ tenantId, persona }) {
    const id = createHash("sha256").update(`${tenantId}:${persona.id}`).digest("hex");
    return createPersonaRuntime({
      persona,
      memory: getMemory({ tenantId, personaId: persona.id }),
      model: providerAdapters().model,
      stateStore: new JsonFilePersonaStateStore(join(dataDirectory, `${id}.state.json`)),
    });
  },
});

const port = Number(process.env.PORT ?? 8787);
createServer(createNodeHandler(api)).listen(port, () => {
  console.log(`Character Runtime service listening on http://localhost:${port}`);
});

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function parseApiKeys(value) {
  return Object.fromEntries(
    value.split(",").map((pair) => {
      const separator = pair.indexOf(":");
      if (separator < 1)
        throw new Error("CHARACTER_MEMORY_API_KEYS must contain key:tenant pairs.");
      return [pair.slice(0, separator), pair.slice(separator + 1)];
    }),
  );
}
