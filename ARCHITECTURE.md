# Architecture

## Design goals

The package is infrastructure, not a chat frontend. It must remain usable from text chat, voice,
games, bots, and server applications while allowing providers and databases to change independently.

The dependency rule is:

```text
application
    |
    v
persona runtime ---> character model <--- OpenAI / Bedrock adapters
    |
    v
memory runtime ---> extractor port <--- OpenAI / Bedrock adapters
    |
    +------------> embedding port <--- OpenAI / Titan adapters
    |
    +------------> store port <------- memory / JSON / future databases
```

Core code does not import OpenAI, AWS, or filesystem modules. Vendor and persistence integrations
depend inward on core contracts.

## Modules

### Core

`src/core` owns:

- The canonical memory schema and lifecycle
- Extraction and embedding ports
- Ingestion, provenance validation, consolidation, and lifecycle controls
- Retrieval constraints and prompt-budget packing
- Provider-independent errors

It does not own credentials, HTTP clients, or database connections.

### Providers

`src/providers` adapts vendor SDKs to the core ports.

- OpenAI extraction uses Responses API structured output.
- Bedrock extraction uses Converse structured output.
- OpenAI embeddings use the embeddings API.
- Bedrock embeddings use Titan Text Embeddings V2 through InvokeModel.

Provider responses are validated again with Zod at the boundary. Structured output protects syntax;
runtime validation protects domain constraints and produces stable errors.

### Stores

`src/stores` owns persistence adapters.

- `InMemoryMemoryStore` is deterministic and intended for tests or short-lived processes.
- `JsonFileMemoryStore` is a local reference adapter with versioned files, serialized writes, and
  temporary-file replacement.
- `SQLiteMemoryStore` uses WAL mode, indexes, and transactional batch writes for durable
  deployments.

The store persists complete canonical records. Vectors can always be regenerated from `content`.

## Ingestion lifecycle

```text
messages
  -> normalize and validate
  -> provider extraction
  -> validate schema and source-message provenance
  -> discard low-confidence candidates
  -> consolidation (merge, supersede, conflict, or keep)
  -> generate embeddings for new records
  -> batch persistence
```

The runtime never accepts a source message ID invented by a model. Candidates with no remaining
valid provenance are discarded.

Consolidation is a replaceable policy rather than database behavior. The default policy merges
normalized/semantic duplicates, supersedes mutable state, and surfaces contradictions to the caller.

## Recall lifecycle

```text
query
  -> optional query embedding
  -> scope and identity filters
  -> semantic + lexical + importance + recency scoring
  -> expiry filtering
  -> token-budget packing
  -> bounded, explicitly untrusted memory context
```

The prompt renderer labels recalled content as recollection rather than instruction. Applications
should place the resulting block in contextual data, never above their security or behavior policy.

## Identity and isolation

`characterId` is required on every operation. `userId` defaults to `null` and is included in
retrieval filters. Applications should use opaque stable IDs, not mutable display names.

The service adapter resolves API keys to tenant IDs, but its store factory must also provide
physical or logical tenant partitioning. Do not encode tenancy only in vector metadata.

## Failure behavior

- Provider refusals, truncated output, malformed JSON, and schema violations fail ingestion without
  partially writing new records.
- Embedding count mismatches fail before persistence.
- File writes are serialized and atomically replaced.
- Empty conversations and empty recalls are valid and return empty results.

## Higher layers

`src/persona` owns manifests, prompt compilation, relationship state, delivery hints, and response
orchestration. `src/service` wraps persona runtimes in tenant-aware HTTP routes. `src/sillytavern`
is a compatibility boundary, so card fields do not leak into the canonical schema. `src/evaluation`
measures retrieval hit rate/MRR and aggregates deterministic drift checks.

## Package exports

The root export contains only core and the in-memory store. Heavy or environment-specific adapters
use explicit subpaths:

```text
persona-ai-sdk
persona-ai-sdk/openai
persona-ai-sdk/bedrock
persona-ai-sdk/stores/json-file
persona-ai-sdk/stores/sqlite
persona-ai-sdk/persona
persona-ai-sdk/sillytavern
persona-ai-sdk/service
persona-ai-sdk/evaluation
```

This prevents browser or edge consumers from loading AWS and filesystem code accidentally and gives
the package room to split adapters into optional packages later without changing the core API.
