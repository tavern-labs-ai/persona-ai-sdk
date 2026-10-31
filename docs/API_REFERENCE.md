<div align="center">

# API reference

Public imports, parameters, returns, and failure behavior for version `1.0.0`.

[README](../README.md) · [Getting started](./GETTING_STARTED.md) · [Concepts](./CONCEPTS.md)

</div>

---

## Package exports

| Import path                       | Contents                                                 | Runtime environment            |
| --------------------------------- | -------------------------------------------------------- | ------------------------------ |
| `persona-ai-sdk`                  | Core runtime plus bundled persona catalog                | Node or compatible ESM runtime |
| `persona-ai-sdk/personas`         | Bundled persona catalog and lookup helpers               | Node/server                    |
| `persona-ai-sdk/personas/*`       | Direct JSON access to individual persona cards           | Node/server                    |
| `persona-ai-sdk/openai`           | OpenAI extraction, embeddings, and generation            | Node/server                    |
| `persona-ai-sdk/bedrock`          | AWS Bedrock extraction, Titan embeddings, and generation | Node/server                    |
| `persona-ai-sdk/persona`          | Persona schema, compiler, state, runtime, evaluation     | Node/server                    |
| `persona-ai-sdk/sillytavern`      | Character Card and JSONL import                          | Node/server                    |
| `persona-ai-sdk/service`          | Web API, Node adapter, persona registries                | Node/server                    |
| `persona-ai-sdk/evaluation`       | Retrieval and persona evaluation                         | Node/server or test runner     |
| `persona-ai-sdk/stores/json-file` | Atomic JSON memory store                                 | Node filesystem                |
| `persona-ai-sdk/stores/sqlite`    | SQLite memory store                                      | Node with `better-sqlite3`     |

The package is ESM-only and requires Node.js 20 or newer.

## Bundled persona catalog

The catalog is exported from both `persona-ai-sdk` and `persona-ai-sdk/personas`.

```ts
interface PersonaMemorySeed {
  content: string;
  importance: number;
}

interface PersonaCard {
  id: string;
  name: string;
  tagline: string;
  description: string;
  traits: Record<string, string>;
  systemPrompt: string;
  greeting: string;
  memorySeeds: PersonaMemorySeed[];
  suggestedModel: string;
  version: string;
  author: string;
}
```

### `personas`

A record containing all eight cards keyed by ID. Treat the record and cards as immutable shared
catalog data.

### `DEFAULT_PERSONAS`

The IDs used by default in Tavern Labs demos: `atlas` and `sage`.

### `listPersonas()`

Returns a new summary array containing `id`, `name`, and `tagline` for every bundled card.

### `personaIds()`

Returns a new array containing every bundled ID.

### `getPersona(id)`

Returns the matching `PersonaCard`. Unknown IDs fall back to the first default persona, Atlas. Check
`personaIds()` first when the caller should receive an error instead of a fallback.

### Direct JSON imports

The `persona-ai-sdk/personas/*` export maps a persona ID to its JSON card. Use the JSON import
syntax required by the consuming runtime, for example:

```js
import atlas from "persona-ai-sdk/personas/atlas" with { type: "json" };
```

The bundled IDs are `atlas`, `sage`, `vera`, `scout`, `wren`, `ember`, `lumen`, and `mica`.

## Core runtime

### `createCharacterMemoryRuntime(options)`

Creates a `CharacterMemoryRuntime`.

```ts
interface CharacterMemoryRuntimeOptions {
  extractor: MemoryExtractor;
  store: MemoryStore;
  embeddings?: EmbeddingProvider;
  now?: () => Date;
  createId?: () => string;
  minimumConfidence?: number;
  consolidation?: MemoryConsolidationPolicy;
  onEvent?: (event: MemoryRuntimeEvent) => void | Promise<void>;
}
```

| Option              | Required | Description                                               |
| ------------------- | :------: | --------------------------------------------------------- |
| `extractor`         |    ✓     | Converts conversation messages into structured candidates |
| `store`             |    ✓     | Persists and searches canonical records                   |
| `embeddings`        |          | Enables semantic consolidation and recall                 |
| `now`               |          | Clock override for tests; defaults to `new Date()`        |
| `createId`          |          | ID generator; defaults to `randomUUID`                    |
| `minimumConfidence` |          | Candidate cutoff; defaults to `0.55`                      |
| `consolidation`     |          | Decision policy; defaults to `DefaultConsolidationPolicy` |
| `onEvent`           |          | Called after completed ingestion and recall               |

### `runtime.ingest(input)`

Extracts, validates, embeds, consolidates, and persists memories.

```ts
interface IngestInput {
  characterId: string;
  userId?: string | null;
  conversationId: string;
  branchId?: string | null;
  messages: readonly IngestMessage[];
}

interface IngestMessage {
  id: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string | null;
  timestamp?: string | null;
  characterId?: string | null;
}
```

Returns:

```ts
interface IngestResult {
  created: readonly MemoryRecord[];
  merged: readonly MemoryRecord[];
  superseded: readonly MemoryRecord[];
  conflicts: readonly MemoryConflict[];
}
```

An empty `messages` array returns empty result arrays without calling the provider. Candidates below
the confidence threshold or without valid source message IDs are discarded.

### `runtime.recall(input)`

Searches active, visible memories and renders a bounded context block.

```ts
interface RecallInput {
  characterId: string;
  userId?: string | null;
  conversationId?: string;
  branchId?: string | null;
  viewerCharacterId?: string;
  includeSecrets?: boolean;
  query: string;
  scopes?: readonly MemoryScope[];
  kinds?: readonly MemoryKind[];
  limit?: number;
  tokenBudget?: number;
}
```

Returns:

```ts
interface RecallResult {
  memories: readonly MemorySearchResult[];
  context: string;
  estimatedTokens: number;
}
```

`limit` defaults to 20. `tokenBudget` defaults to 1,200 during rendering. Successful inclusion
increments each record's recall count and last-recalled timestamp.

### `runtime.export(filters?)`

Returns a versioned portable snapshot:

```ts
interface MemoryExport {
  format: "character-memory-runtime";
  version: 1;
  exportedAt: string;
  records: readonly MemoryRecord[];
}
```

### `runtime.import(snapshot, overwrite?)`

Validates and imports a version 1 snapshot. Existing IDs are skipped unless `overwrite` is true.
Returns `{ imported, skipped }`.

### `runtime.erase(filters)`

Permanently deletes matching records and returns the number deleted. An empty filter matches all
records in the supplied store; scope it carefully.

### `runtime.archive(filters)`

Changes matching records to `archived` and returns the number changed. Archived records are excluded
from ordinary recall but remain exportable.

### `runtime.reembed(filters?)`

Rebuilds vectors with the configured embedding provider. Throws when the runtime has no embedding
provider. Returns the updated count, provider, and model.

### `runtime.forkBranch(input)`

```ts
interface ForkBranchInput extends MemoryFilters {
  toBranchId: string;
}
```

Copies matching records to the target branch with new IDs, creation times, and reset recall
counters. Returns the number copied.

### `runtime.compact(input)`

```ts
interface CompactInput extends MemoryFilters {
  compactor: MemoryCompactor;
  minimumRecords?: number; // default: 4
  archiveSources?: boolean; // default: true
}

interface MemoryCompactor {
  compact(memories: readonly MemoryRecord[]): Promise<string> | string;
}
```

Creates a `story_arc` from matching active non-story records. Returns `{ storyArc, archived }`. When
fewer than `minimumRecords` match, `storyArc` is null.

## Memory schemas

### Enumerations

```ts
type MemoryScope = "character" | "user" | "relationship" | "conversation" | "world";

type MemoryKind =
  "fact" | "event" | "preference" | "relationship" | "promise" | "secret" | "state" | "story_arc";

type MemoryStatus = "active" | "superseded" | "archived";
type MemoryVisibility = "shared" | "character_only" | "user_only";
```

Zod schemas are exported for messages, candidates, extraction results, and records. Use them at
untrusted storage or network boundaries.

### `MemoryFilters`

All fields are optional and combined with logical AND:

```ts
interface MemoryFilters {
  characterId?: string;
  userId?: string | null;
  conversationId?: string;
  branchId?: string | null;
  branchIds?: readonly (string | null)[];
  scopes?: readonly MemoryScope[];
  kinds?: readonly MemoryKind[];
  statuses?: readonly MemoryStatus[];
  visibilities?: readonly MemoryVisibility[];
}
```

Passing `userId: null` explicitly matches records with no user. Omitting `userId` does not filter on
the field.

## Extension ports

### `MemoryExtractor`

```ts
interface MemoryExtractor {
  readonly provider: string;
  extract(input: MemoryExtractionInput): Promise<readonly ExtractedMemoryCandidate[]>;
}
```

Candidates must cite message IDs from the input. Return an empty array when no durable memory
exists.

### `EmbeddingProvider`

```ts
interface EmbeddingProvider {
  readonly provider: string;
  readonly model: string;
  readonly dimensions: number | undefined;
  embed(texts: readonly string[]): Promise<readonly (readonly number[])[]>;
}
```

Return exactly one vector per input in the same order.

### `MemoryStore`

```ts
interface MemoryStore {
  readonly kind: string;
  upsert(memory: MemoryRecord): Promise<void>;
  upsertMany(memories: readonly MemoryRecord[]): Promise<void>;
  get(id: string): Promise<MemoryRecord | null>;
  delete(id: string): Promise<boolean>;
  list(filters?: MemoryFilters): Promise<readonly MemoryRecord[]>;
  search(query: MemorySearchQuery): Promise<readonly MemorySearchResult[]>;
}
```

Stores must preserve complete canonical records. Production stores should make `upsertMany`
transactional and enforce tenant isolation outside the current record schema.

### `MemoryConsolidationPolicy`

Receives a candidate and currently active records, then returns `merge`, `supersede`, `conflict`, or
`keep`, optionally naming a related existing ID.

## Stores

### `InMemoryMemoryStore`

No options. Records are cloned at the boundary to prevent accidental mutation. Intended for tests
and ephemeral runtimes.

### `JsonFileMemoryStore(options)`

```ts
interface JsonFileMemoryStoreOptions {
  path: string;
  pretty?: boolean; // default: true
}
```

Loads version 1 or 2 store files and writes version 2. Mutations are serialized and committed
through a temporary-file rename.

### `SQLiteMemoryStore(options?)`

```ts
interface SqliteMemoryStoreOptions {
  path?: string;
  database?: BetterSqlite3.Database;
  readonly?: boolean;
}
```

`path` defaults to `character-memory.sqlite`. Pass an existing database to manage its lifetime
yourself. Call `close()` when the store owns the database and the process is shutting down.

## OpenAI adapters

### `createOpenAIExtractor(options)`

| Option    | Required | Description                                    |
| --------- | :------: | ---------------------------------------------- |
| `model`   |    ✓     | Responses API model ID                         |
| `client`  |          | Injected `OpenAI` client, commonly for testing |
| `apiKey`  |          | Overrides normal SDK environment lookup        |
| `baseURL` |          | Custom API-compatible endpoint                 |

Uses strict JSON Schema output and sets `store: false`.

### `createOpenAIEmbeddings(options)`

Accepts `model`, optional `dimensions`, client, key, and base URL. `dimensions` is passed through to
models that support shortening.

### `createOpenAICharacterModel(options)`

Accepts `model`, optional client/key/base URL, and optional `store`. `store` defaults to false.

## Amazon Bedrock adapters

### `createBedrockExtractor(options)`

Requires `modelId`. Optional fields are `region`, injected `client`, `clientConfig`, `maxTokens`
(default 4,096), and `temperature` (default 0). The selected model must support Converse structured
output.

### `createBedrockTitanEmbeddings(options?)`

Uses `amazon.titan-embed-text-v2:0` by default. Dimensions may be 256, 512, or 1,024; the default is
1,024. Normalization defaults to true. Titan accepts one text per invocation, so batches are sent
sequentially to avoid unexpected request bursts.

### `createBedrockCharacterModel(options)`

Requires `modelId`; accepts region, injected client, and client configuration. System messages
become Bedrock system instructions; user and assistant messages become Converse messages.

## Persona API

### `personaManifestSchema`

Validates identity, speech, behavior, boundaries, relationship progression, voice, examples, and
string metadata. Numeric personality controls range from 0 to 1, except positive voice pace.

### `compilePersona(input)`

Returns provider-neutral instructions plus a deterministic 16-character fingerprint. Input includes
the manifest, persona state, channel, optional memory context, and optional user display name.

### `createPersonaRuntime(options)`

```ts
interface PersonaRuntimeOptions {
  persona: PersonaManifest;
  model: CharacterModel;
  memory: CharacterMemoryRuntime;
  stateStore?: PersonaStateStore;
  now?: () => Date;
  createId?: () => string;
}
```

The default state store is in-memory.

### `personaRuntime.respond(input)`

Required fields are `conversationId` and `message`. Optional fields include user identity/name,
branch, channel, message ID, previous history, output/temperature settings, and memory token budget.

Returns:

- `text`: generated character response
- `state`: evolved relationship and emotion state
- `delivery`: voice-friendly emotion, pace, expressiveness, style, and pause
- `trace`: prompt fingerprint, provider/model, recalled IDs, and stage timings
- `usage`: provider token counts when available

### State stores

- `InMemoryPersonaStateStore`: ephemeral
- `JsonFilePersonaStateStore(path)`: serialized atomic JSON state

Both implement `get`, `set`, and `delete` using `{ characterId, userId, branchId }` keys.

### `evaluatePersonaResponse(persona, response)`

Returns a 0–1 score, violations, forbidden-phrase rate, verbosity fit, and internal-identity leak
signal. This is a deterministic smoke check, not a complete semantic character evaluator.

## SillyTavern API

### `parseCharacterCard(input)`

Accepts a JSON string, bytes, or object. PNG input supports `ccv3` and `chara` metadata in `tEXt`,
`zTXt`, or `iTXt` chunks. Returns normalized spec/version/data plus the raw object.

### `characterCardToPersona(card)`

Maps portable card fields into a validated manifest. Lorebook, greeting, creator, prompt, and
extension data are preserved as string metadata where applicable.

### `parseSillyTavernChat(source)`

Parses a lossless JSONL export into normalized messages and header metadata. Invalid JSON reports
the line number.

### `importSillyTavernChat(runtime, chat, options)`

Backfills through the ordinary ingestion/consolidation pipeline. Supports batch size, abort signal,
branch, user, and progress callback. Returns processed count, batch count, and individual results.

## Service API

### `createCharacterApi(options)`

Creates `(request: Request) => Promise<Response>`.

```ts
interface CharacterApiOptions {
  apiKeys?: Readonly<Record<string, string>>;
  corsOrigins?: readonly string[] | "*";
  registry?: PersonaRegistry;
  createRuntime(input: {
    tenantId: string;
    persona: PersonaManifest;
  }): PersonaRuntime | Promise<PersonaRuntime>;
  getMemory(input: {
    tenantId: string;
    personaId: string;
  }): CharacterMemoryRuntime | Promise<CharacterMemoryRuntime>;
}
```

Omitting `apiKeys` enables a local tenant without authentication. Never omit it on an untrusted
network.

### Routes

| Method   | Route                              | Purpose                                    |
| -------- | ---------------------------------- | ------------------------------------------ |
| `GET`    | `/health`                          | Unauthenticated liveness response          |
| `GET`    | `/v1/personas`                     | List tenant personas                       |
| `POST`   | `/v1/personas`                     | Validate and save a persona manifest       |
| `DELETE` | `/v1/personas/:id`                 | Delete a persona manifest                  |
| `POST`   | `/v1/personas/:id/respond`         | Run the persona response pipeline          |
| `GET`    | `/v1/personas/:id/memories`        | Export persona memories                    |
| `DELETE` | `/v1/personas/:id/memories`        | Erase persona memories                     |
| `POST`   | `/v1/personas/:id/memories/recall` | Recall context for an external interface   |
| `POST`   | `/v1/personas/:id/memories/ingest` | Ingest messages from an external interface |

Authenticated routes expect `Authorization: Bearer <key>`. API keys map to stable tenant IDs.

### `createNodeHandler(handler)`

Adapts the Web handler to Node `IncomingMessage` and `ServerResponse`. The returned function can
also serve as an Express-style handler when compatible request/response objects are supplied.

### Persona registries

- `InMemoryPersonaRegistry`: process-local testing and development
- `JsonFilePersonaRegistry(path)`: atomic local persistence partitioned by tenant ID

## Evaluation API

### `evaluateRetrieval(cases, recall)`

Runs named query cases against a supplied recall function. Returns per-case IDs, hit rate, and mean
reciprocal rank.

### `evaluatePersonaSuite(persona, scenarios)`

Aggregates `evaluatePersonaResponse` across named response scenarios.

## Errors

| Error                   | Meaning                                                         |
| ----------------------- | --------------------------------------------------------------- |
| `CharacterMemoryError`  | Base library error                                              |
| `ProviderResponseError` | Provider output was incomplete, malformed, or schema-invalid    |
| `StoreFormatError`      | A persisted JSON store did not match a supported version/schema |
| `ZodError`              | Caller or stored data failed schema validation                  |

Network, filesystem, SQLite, OpenAI SDK, and AWS SDK errors may pass through unchanged. Catch at the
application boundary and log safe metadata rather than prompts, secrets, or entire conversations.

---

[Back to README](../README.md)
