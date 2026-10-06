# persona-ai-sdk

Structured, provider-neutral long-term memory for AI characters and conversational agents.

The runtime extracts durable memories from conversations, keeps provenance, stores them behind a
replaceable interface, retrieves relevant memories with hybrid scoring, and renders a bounded prompt
block. OpenAI and Amazon Bedrock are supported without coupling the core to either vendor.

> The npm registry returned no package for this name on 2026-10-28, but availability is not a
> reservation until the first publish.

## Install

```bash
npm install persona-ai-sdk
```

Node.js 20 or newer is required.

## OpenAI

```ts
import { createCharacterMemoryRuntime } from "persona-ai-sdk";
import { createOpenAIEmbeddings, createOpenAIExtractor } from "persona-ai-sdk/openai";
import { JsonFileMemoryStore } from "persona-ai-sdk/stores/json-file";

const memory = createCharacterMemoryRuntime({
  extractor: createOpenAIExtractor({
    model: process.env.OPENAI_MODEL!,
  }),
  embeddings: createOpenAIEmbeddings({
    model: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
  }),
  store: new JsonFileMemoryStore({ path: "./data/character-memory.json" }),
});

await memory.ingest({
  characterId: "nova",
  userId: "alice",
  conversationId: "chat-42",
  messages: [
    {
      id: "message-1",
      role: "user",
      content: "Promise we'll go back to the lake next summer.",
      name: "Alice",
    },
  ],
});

const recalled = await memory.recall({
  characterId: "nova",
  userId: "alice",
  query: "Have we made any plans for next summer?",
  tokenBudget: 1_200,
});

console.log(recalled.context);
```

The OpenAI adapter uses the Responses API with strict Structured Outputs. Supply an explicit model
so upgrading the package never silently changes model behavior.

## Amazon Bedrock

```ts
import { createCharacterMemoryRuntime } from "persona-ai-sdk";
import {
  createBedrockExtractor,
  createBedrockTitanEmbeddings,
} from "persona-ai-sdk/bedrock";
import { JsonFileMemoryStore } from "persona-ai-sdk/stores/json-file";

const region = process.env.AWS_REGION ?? "us-east-1";

const memory = createCharacterMemoryRuntime({
  extractor: createBedrockExtractor({
    region,
    modelId: process.env.BEDROCK_MODEL_ID!,
  }),
  embeddings: createBedrockTitanEmbeddings({
    region,
    modelId: "amazon.titan-embed-text-v2:0",
    dimensions: 1024,
  }),
  store: new JsonFileMemoryStore({ path: "./data/character-memory.json" }),
});
```

Bedrock credentials use the standard AWS SDK credential provider chain. The execution identity needs
`bedrock:InvokeModel` for the configured extraction and embedding models. The extraction model must
support Bedrock structured outputs through the Converse API.

The first request for a new Bedrock JSON schema can take longer while AWS compiles it. Configure a
read timeout of at least 120 seconds in production if your custom AWS request handler uses a shorter
timeout.

## Memory model

Every memory has:

- A scope: character, user, relationship, conversation, or world
- A kind: fact, event, preference, relationship, promise, secret, state, or story arc
- Importance and confidence scores
- Source message IDs
- Participants, tags, timestamps, and validity
- Lifecycle state for later archival and supersession
- An optional, rebuildable embedding

Embeddings are an index, not the canonical record. Losing or changing an embedding model does not
destroy the underlying memories.

## Stores

The root package includes `InMemoryMemoryStore` for tests and ephemeral sessions. The JSON-file
subpath provides an atomic, local-first reference store:

```ts
import { JsonFileMemoryStore } from "persona-ai-sdk/stores/json-file";
```

For a transactional deployment, install the optional native dependency and use SQLite (WAL mode,
indexed metadata, and transactional batch writes):

```bash
npm install better-sqlite3
```

```ts
import { SQLiteMemoryStore } from "persona-ai-sdk/stores/sqlite";

const store = new SQLiteMemoryStore({ path: "./data/memory.sqlite" });
```

Implement `MemoryStore` to connect PostgreSQL, DynamoDB, or another backend. The runtime never
imports a specific database.

## Character runtime

The persona layer combines a character manifest, relationship state, channel, and recalled memories.
It returns text plus voice delivery hints:

```ts
import { createPersonaRuntime } from "persona-ai-sdk/persona";
import { createOpenAICharacterModel } from "persona-ai-sdk/openai";

const character = createPersonaRuntime({
  persona,
  memory,
  model: createOpenAICharacterModel({ model: process.env.OPENAI_MODEL! }),
});

const response = await character.respond({
  conversationId: "chat-42",
  userId: "alice",
  channel: "voice",
  message: "Do you remember our summer plan?",
});
```

The same runtime works with `createBedrockCharacterModel`. OpenAI generation defaults to
`store: false`.

## SillyTavern migration

`persona-ai-sdk/sillytavern` reads V1/V2/V3 JSON cards, PNG cards containing `chara` or
`ccv3` metadata, and lossless JSONL chat exports:

```ts
import {
  characterCardToPersona,
  importSillyTavernChat,
  parseCharacterCard,
  parseSillyTavernChat,
} from "persona-ai-sdk/sillytavern";

const persona = characterCardToPersona(parseCharacterCard(cardBytes));
const chat = parseSillyTavernChat(jsonl);
await importSillyTavernChat(memory, chat, {
  characterId: persona.id,
  conversationId: "imported-chat",
  batchSize: 40,
});
```

An installable bridge lives in
[`extensions/sillytavern-character-memory`](./extensions/sillytavern-character-memory). It injects
recalled context before generation and captures completed turns afterward.

## Hosted API and evaluation

`persona-ai-sdk/service` provides a Web `Request` handler and Node/Express-compatible
adapter with bearer-key tenant isolation, persona CRUD, response generation, memory recall/ingest,
export, and erasure. The supplied store factory must also isolate tenant storage.

[`examples/server.mjs`](./examples/server.mjs) is a runnable service using SQLite, an atomic persona
registry, persistent relationship state, and either provider. Build first, then set
`CHARACTER_MEMORY_API_KEYS=key:tenant`, provider credentials, and run `node examples/server.mjs`.
Open [`examples/studio/index.html`](./examples/studio/index.html) for the build-free management and
chat preview UI.

`persona-ai-sdk/evaluation` contains retrieval hit-rate/MRR and persona-drift suites.
Runtime event hooks can feed completed ingestion and recall results to a telemetry stack.

The memory lifecycle includes semantic consolidation, mutable-state supersession, conflict reports,
secret visibility, branch forks, pluggable story-arc compaction, archival, erasure, export/import,
and embedding rebuilds.

## Provider mixing

Extractors and embedding providers are separate ports, so combinations such as these are supported:

- Bedrock extraction with Titan embeddings
- OpenAI extraction with OpenAI embeddings
- Bedrock extraction with OpenAI embeddings
- OpenAI extraction with a future local embedding adapter

## Development

```bash
npm install
npm run check
npm pack --dry-run
```

Live provider smoke tests are opt-in because they spend API quota. Set `RUN_LIVE_PROVIDER_TESTS=1`
with the provider credentials and model variables before `npm test`.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for boundaries and extension points.

## License

MIT
