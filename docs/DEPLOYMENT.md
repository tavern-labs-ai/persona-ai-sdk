<div align="center">

# Deployment guide

Run the service safely from local development through a single-node production deployment.

[README](../README.md) · [API reference](./API_REFERENCE.md) · [Security](./SECURITY.md)

</div>

---

## What is included

The package supplies application building blocks rather than a managed hosting product:

- A framework-neutral Web `Request` handler
- A Node HTTP adapter
- Bearer-key-to-tenant resolution
- In-memory and atomic JSON persona registries
- Persistent JSON relationship state
- SQLite memory persistence
- A runnable OpenAI/Bedrock example
- A build-free browser Studio

It does not include billing, user registration, OAuth, distributed rate limiting, a job queue, or
managed backups.

## Run the example server

### 1. Build

```bash
npm install
npm run build
```

### 2. Configure

OpenAI example:

```text
CHARACTER_PROVIDER=openai
CHARACTER_MEMORY_API_KEYS=local-secret:local-tenant
OPENAI_API_KEY=...
OPENAI_MODEL=<model-id>
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
PORT=8787
```

Bedrock example:

```text
CHARACTER_PROVIDER=bedrock
CHARACTER_MEMORY_API_KEYS=local-secret:local-tenant
AWS_REGION=us-east-1
BEDROCK_MODEL_ID=<model-id>
PORT=8787
```

Multiple keys use comma-separated `key:tenant` pairs:

```text
CHARACTER_MEMORY_API_KEYS=key-one:tenant-a,key-two:tenant-b
```

Do not use colons or commas inside keys/tenant IDs with the example parser. A production application
should load hashed credentials from a secrets manager or database instead.

### 3. Start

```bash
node examples/server.mjs
```

### 4. Check health

```bash
curl http://localhost:8787/health
```

Expected response:

```json
{ "status": "ok" }
```

## Create a persona

```bash
curl -X POST http://localhost:8787/v1/personas \
  -H "Authorization: Bearer local-secret" \
  -H "Content-Type: application/json" \
  --data-binary @persona.json
```

Then respond:

```bash
curl -X POST http://localhost:8787/v1/personas/nova/respond \
  -H "Authorization: Bearer local-secret" \
  -H "Content-Type: application/json" \
  -d '{"conversationId":"demo","userId":"alice","message":"Hello, Nova."}'
```

## Use the Studio

Serve the Studio from a local web server rather than relying on `file://` behavior:

```bash
npx serve examples/studio
```

Open the displayed URL, enter the API endpoint and tenant key, then connect. In production, serve it
behind authentication and set an explicit CORS origin.

## Persistence layout in the example

The example writes beneath `./data`:

```text
data/
├── personas.json
├── <sha256-tenant-persona>.sqlite
└── <sha256-tenant-persona>.state.json
```

The filename hash avoids placing raw tenant or persona IDs into paths. The persona registry stores
tenants in one JSON file; SQLite and state files are separated per tenant/persona pair.

This layout is appropriate for a trusted single process. It is not safe for multiple service
instances writing the same JSON files over a network filesystem.

## Production storage choices

### Single process / one host

- SQLite on local durable storage
- Atomic JSON persona/state files
- Regular filesystem snapshots
- One active writer process

### Multiple processes or hosts

Implement the `MemoryStore`, `PersonaRegistry`, and `PersonaStateStore` interfaces on a shared
transactional database. Tenant ID must participate in every storage key and query. Add database
constraints, not only application filters.

Potential choices include PostgreSQL with a vector extension, DynamoDB plus a vector service, or a
document database paired with an embedding index. The package does not currently ship those
adapters.

## Reverse proxy

Terminate TLS at a trusted proxy or load balancer. Preserve:

- `Authorization`
- `Content-Type`
- `Origin`
- `OPTIONS` requests
- Request body size limits large enough for approved persona imports, but no larger

Recommended proxy controls:

- TLS 1.2 or newer
- Per-key and per-IP rate limits
- Request timeout greater than the slowest allowed provider call
- Maximum body size
- Structured access logs without authorization headers or bodies
- Unique request IDs

## CORS

Use explicit origins:

```ts
corsOrigins: ["https://studio.example.com", "https://chat.example.com"];
```

`"*"` is convenient for local development but allows any browser origin to call the endpoint with a
key available to that page.

## Timeouts and retries

Provider calls are network operations. Configure:

- A total request deadline
- Provider SDK retry limits
- Backoff with jitter for retryable errors
- No blind retry for non-idempotent response generation
- An ingestion retry path keyed by stable message IDs

Bedrock may need a longer initial timeout when a structured-output schema is first compiled. Measure
in the deployment region and model account rather than relying on one global timeout.

## Rate and cost controls

At minimum, enforce:

- Requests per tenant and per API key
- Maximum message/history length
- Maximum output tokens
- Maximum memory token budget
- Maximum imports and import batch size
- Maximum persona/card payload size
- Provider spend alerts

The runtime passes optional output settings through but does not enforce a platform-wide ceiling.
Clamp user-supplied values at your API boundary.

## Observability

Use `onEvent` for memory operations and `PersonaResponse.trace` for response stages.

Useful metrics:

- Ingestion/recall/generation latency
- Extracted, merged, superseded, and conflicting memory counts
- Empty recall rate
- Recalled memory count and token estimate
- Provider error/refusal rate
- Token usage and estimated cost
- API status rate by route and tenant tier
- SQLite busy/lock failures

Do not log raw messages, memory content, prompts, API keys, or provider credentials by default.

## Backups and recovery

Back up the persona registry, state files, and memory databases together. For SQLite, use a backup
mechanism aware of WAL rather than copying only the main database file during active writes.

Test restoration. A backup is not complete until a clean process can load personas, state, and
memory and return a valid response.

Embeddings can be rebuilt, but canonical memory records and provenance cannot be recreated reliably
from vectors.

## Shutdown

Stop accepting traffic, wait for in-flight requests, flush logs/metrics, and close owned SQLite
stores. The example keeps stores in memory for process lifetime; a production wrapper should retain
references and call `close()` during graceful shutdown.

## Deployment checklist

- [ ] Public repository/package metadata is configured
- [ ] Provider models are explicitly pinned and qualified
- [ ] Live provider smoke tests pass in the target account/region
- [ ] API keys are random, scoped, hashed at rest, and rotatable
- [ ] Tenant isolation is enforced in storage
- [ ] TLS, CORS, rate limits, timeouts, and body limits are configured
- [ ] Logs redact sensitive content
- [ ] Backups and restore drills are working
- [ ] Export and erasure workflows are tested
- [ ] Provider and infrastructure spend alerts are enabled
- [ ] Studio access is authenticated or disabled

---

[Back to README](../README.md)
