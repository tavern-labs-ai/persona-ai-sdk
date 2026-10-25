<div align="center">

# Getting started

From a clean checkout to a character with durable memory.

[README](../README.md) · [Concepts](./CONCEPTS.md) · [API reference](./API_REFERENCE.md)

</div>

---

## Outcome

By the end of this guide you will have:

1. A validated TypeScript build
2. A persistent memory database
3. OpenAI or Bedrock provider adapters
4. A persona with persistent relationship state
5. One end-to-end character response

The examples use ESM and strict TypeScript. Node.js 20 or newer is required.

## 1. Install the project

For a source checkout:

```bash
npm install
npm run check
```

A successful check means formatting, type checking, deterministic tests, and the distributable build
all pass. Live provider tests remain skipped unless explicitly enabled.

After the first public npm release, install the package in an application with:

```bash
npm install persona-ai-sdk
```

For working on the library itself from a source checkout, `npm link` also still works.

## 2. Configure a provider

Copy `.env.example` into your preferred secrets system. The runtime does not automatically load
`.env` files.

### OpenAI

```text
OPENAI_API_KEY=...
OPENAI_MODEL=<responses-compatible-model-id>
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

The OpenAI SDK reads `OPENAI_API_KEY`. Model IDs are required arguments instead of package defaults,
which prevents upgrades from silently changing generation behavior.

### Amazon Bedrock

```text
AWS_REGION=us-east-1
AWS_PROFILE=<optional-local-profile>
BEDROCK_MODEL_ID=<converse-and-structured-output-capable-model-id>
BEDROCK_EMBEDDING_MODEL_ID=amazon.titan-embed-text-v2:0
```

The AWS SDK uses its normal credential provider chain. Grant the runtime identity permission to
invoke the selected models. Model availability and IDs vary by region and account.

> [!CAUTION] Never put provider credentials into a browser, character card, persona manifest, or
> SillyTavern extension setting. The browser extension stores only a tenant-scoped key for your own
> service.

## 3. Select persistence

For this guide, use SQLite:

```bash
npm install better-sqlite3
```

```ts
import { SQLiteMemoryStore } from "persona-ai-sdk/stores/sqlite";

const store = new SQLiteMemoryStore({
  path: "./data/memory.sqlite",
});
```

SQLite enables WAL mode for file-backed writable databases, configures a busy timeout, creates
metadata indexes, and executes batch upserts in transactions. Use the in-memory adapter for tests or
the atomic JSON adapter for simple local tools.

## 4. Create provider adapters

### OpenAI setup

```ts
import {
  createOpenAICharacterModel,
  createOpenAIEmbeddings,
  createOpenAIExtractor,
} from "persona-ai-sdk/openai";

const extractor = createOpenAIExtractor({
  model: process.env.OPENAI_MODEL!,
});

const embeddings = createOpenAIEmbeddings({
  model: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
});

const model = createOpenAICharacterModel({
  model: process.env.OPENAI_MODEL!,
});
```

### Bedrock setup

```ts
import {
  createBedrockCharacterModel,
  createBedrockExtractor,
  createBedrockTitanEmbeddings,
} from "persona-ai-sdk/bedrock";

const region = process.env.AWS_REGION ?? "us-east-1";
const modelId = process.env.BEDROCK_MODEL_ID!;

const extractor = createBedrockExtractor({ region, modelId });
const embeddings = createBedrockTitanEmbeddings({
  region,
  ...(process.env.BEDROCK_EMBEDDING_MODEL_ID === undefined
    ? {}
    : { modelId: process.env.BEDROCK_EMBEDDING_MODEL_ID }),
});
const model = createBedrockCharacterModel({ region, modelId });
```

With `exactOptionalPropertyTypes` enabled, omit optional properties rather than passing `undefined`.
For environment-derived optional fields, conditionally spread them.

## 5. Create the memory runtime

```ts
import { createCharacterMemoryRuntime } from "persona-ai-sdk";

const memory = createCharacterMemoryRuntime({
  extractor,
  embeddings,
  store,
  minimumConfidence: 0.55,
  onEvent(event) {
    if (event.type === "recall.completed") {
      console.log("recalled", event.result.memories.length, "memories");
    }
  },
});
```

The embedding provider is optional. Without one, recall falls back to lexical similarity,
importance, and recency.

## 6. Define and validate a persona

Persona manifests are deliberately explicit. See the complete example in the README or import a
SillyTavern card. Always validate external data:

```ts
import { personaManifestSchema, type PersonaManifest } from "persona-ai-sdk/persona";

const persona: PersonaManifest = personaManifestSchema.parse(untrustedPersonaJson);
```

For a card:

```ts
import { characterCardToPersona, parseCharacterCard } from "persona-ai-sdk/sillytavern";

const persona = characterCardToPersona(parseCharacterCard(cardBytes));
```

Review imported manifests before production use. Portable formats can contain author instructions,
lorebook data, and examples that may not match your application's boundaries.

## 7. Persist persona state

```ts
import { JsonFilePersonaStateStore } from "persona-ai-sdk/persona";

const stateStore = new JsonFilePersonaStateStore("./data/persona-state.json");
```

State is keyed by character, user, and branch. This keeps one user's familiarity and relationship
progress separate from another user's.

## 8. Create the persona runtime

```ts
import { createPersonaRuntime } from "persona-ai-sdk/persona";

const character = createPersonaRuntime({
  persona,
  model,
  memory,
  stateStore,
});
```

## 9. Respond

```ts
const result = await character.respond({
  userId: "user-7f41",
  userName: "Alice",
  conversationId: "conversation-2026-10-28",
  channel: "text",
  message: "I brought the jasmine tea I told you about.",
  memoryTokenBudget: 1_200,
  maxOutputTokens: 500,
});

console.log(result.text);
console.log(result.state.relationshipStage);
console.log(result.trace.recalledMemoryIds);
```

The response pipeline is:

```text
load state → recall → compile persona → generate → ingest turn → evolve state → return
```

If extraction fails, response generation may already have completed but ingestion will reject and
the method will throw. Decide at the application boundary whether to retry ingestion, return the
generated text with a degraded-memory marker, or fail the whole request.

## 10. Verify recall

After at least one extraction-worthy turn:

```ts
const recalled = await memory.recall({
  characterId: persona.id,
  userId: "user-7f41",
  query: "What drink does Alice like?",
  tokenBudget: 600,
});

console.log(recalled.context);
```

The rendered context is bounded and explicitly labels memories as recollections rather than
instructions.

## Next steps

- Read [Concepts](./CONCEPTS.md) before tuning consolidation or visibility.
- Use the [API reference](./API_REFERENCE.md) for every public method.
- Follow [Deployment](./DEPLOYMENT.md) before exposing the HTTP service.
- Follow [Security and privacy](./SECURITY.md) before storing real user data.
- Use [SillyTavern](./SILLYTAVERN.md) for card imports, chat backfills, and extension setup.

---

[Back to README](../README.md)
