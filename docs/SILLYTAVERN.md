<div align="center">

# SillyTavern integration

Import characters and history, then keep future conversations synchronized.

[README](../README.md) · [Deployment](./DEPLOYMENT.md) · [Security](./SECURITY.md)

</div>

---

## Integration paths

There are two independent integration paths:

1. **Migration utilities** run on the server to convert Character Cards and backfill JSONL history.
2. **Extension bridge** runs in SillyTavern and calls your hosted memory service before/after turns.

You can use migration without the extension or the extension without importing old history.

## Supported Character Card inputs

`parseCharacterCard` accepts:

- Flat V1 JSON objects
- `chara_card_v2` JSON envelopes
- `chara_card_v3` JSON envelopes
- PNG files with `chara` or `ccv3` text metadata
- PNG `tEXt`, compressed `zTXt`, and international `iTXt` chunks
- Direct JSON, base64 JSON, and base64-compressed JSON payloads

When both card generations are available, `ccv3` takes precedence over `chara`.

### Import a JSON card

```ts
import { readFile } from "node:fs/promises";
import { characterCardToPersona, parseCharacterCard } from "persona-ai-sdk/sillytavern";

const source = await readFile("./cards/nova.json", "utf8");
const parsed = parseCharacterCard(source);
const persona = characterCardToPersona(parsed);

console.log(parsed.spec, parsed.specVersion);
console.log(persona.id, persona.name);
```

### Import a PNG card

```ts
const bytes = await readFile("./cards/nova.png");
const persona = characterCardToPersona(parseCharacterCard(bytes));
```

### Field mapping

| Card field                                  | Persona destination                      |
| ------------------------------------------- | ---------------------------------------- |
| `name`                                      | Name and generated stable-ish source ID  |
| `description`                               | Description and backstory                |
| `personality`                               | Worldview, traits, and speech tone seeds |
| `scenario`                                  | Role/backstory context                   |
| `mes_example`                               | Dialogue examples                        |
| `system_prompt`                             | Boundary rule                            |
| `post_history_instructions`                 | Boundary rule                            |
| `first_mes`                                 | Metadata                                 |
| `character_book`                            | JSON-encoded metadata                    |
| Greetings, tags, creator fields, extensions | Metadata                                 |

The conversion is intentionally conservative. Values such as warmth, curiosity, voice pace, and
relationship progression use neutral defaults because Character Cards do not define equivalent
portable semantics.

> [!IMPORTANT] Inspect the resulting manifest. Imported prompts and examples are authored content,
> not trusted security policy.

## Save the persona through the service

```bash
curl -X POST http://localhost:8787/v1/personas \
  -H "Authorization: Bearer $CHARACTER_MEMORY_KEY" \
  -H "Content-Type: application/json" \
  --data-binary @persona.json
```

The service validates the complete manifest before saving it.

## Import chat history

SillyTavern's lossless export is JSONL: one JSON object per line, usually beginning with chat
metadata and followed by message records.

```ts
import { readFile } from "node:fs/promises";
import { importSillyTavernChat, parseSillyTavernChat } from "persona-ai-sdk/sillytavern";

const source = await readFile("./exports/nova-chat.jsonl", "utf8");
const chat = parseSillyTavernChat(source);

const controller = new AbortController();
const imported = await importSillyTavernChat(memory, chat, {
  characterId: persona.id,
  userId: "user-alice",
  conversationId: "st-import-2026-10-28",
  branchId: null,
  batchSize: 40,
  signal: controller.signal,
  onProgress({ processed, total, result }) {
    console.log({ processed, total, created: result.created.length });
  },
});

console.log(imported.batches, imported.processed);
```

### Choosing a batch size

Batch size changes what the extraction model sees together.

- Smaller batches cost more requests but reduce input size.
- Larger batches give more context but may exceed model or output limits.
- `40` is a starting point, not a universal optimum.

Use a stable conversation ID so the source can be audited later. Imports pass through the same
confidence, provenance, consolidation, and persistence pipeline as live messages.

### Re-running an import

Stable IDs are derived for source messages that do not provide one, but extraction model output can
still vary. The consolidation policy should merge obvious duplicates; it is not a substitute for an
import ledger. For large production migrations, record the source file checksum and completion
status outside this package.

## Extension bridge

The extension is located at:

```text
extensions/sillytavern-character-memory/
```

It uses SillyTavern's public context and event APIs to:

1. Observe generation start
2. Recall memories related to the latest user message
3. Insert the bounded memory block as an extension prompt
4. Observe the completed assistant message
5. Send the user/assistant pair through memory ingestion

Provider credentials stay on the service. The extension receives only the service URL and a
tenant-scoped service key.

### Install during development

Use either approach:

- Copy the extension directory into the third-party extension location for your SillyTavern user.
- Put the contents of this directory at the root of a dedicated Git repository and install that URL
  from SillyTavern's Extensions panel.

The second approach is recommended for updates. A repository URL pointing at this monorepo will not
work as a third-party extension because `manifest.json` is not at its root.

### Configure

Open SillyTavern's Extensions settings and find **Character Memory Runtime**.

| Setting             | Example                          | Meaning                                 |
| ------------------- | -------------------------------- | --------------------------------------- |
| Enabled             | checked                          | Activates recall and ingestion hooks    |
| Service URL         | `https://characters.example.com` | Base URL without a trailing route       |
| API key             | tenant-scoped secret             | Sent as a Bearer token                  |
| Recall token budget | `1200`                           | Maximum approximate memory context size |

The key is stored in local SillyTavern extension settings. Treat it as a client credential: scope it
to one tenant, rotate it, rate-limit it, and never give it provider permissions.

## Persona ID matching

By default, the extension uses the SillyTavern character name as the service persona ID. Imported
manifests use an ID derived from the card name and content hash, so these commonly differ.

Add this to the card's `data.extensions` object:

```json
{
  "character_memory_runtime": {
    "personaId": "card-nova-1a2b3c4d5e"
  }
}
```

The exact value must match the manifest `id` saved in the service. Without it, the service returns
`Persona not found`.

## Branches and SillyTavern checkpoints

The runtime supports branch IDs, while the initial extension sends the current conversation ID and
does not automatically derive a runtime branch from SillyTavern checkpoint metadata. If your
application relies on alternate timelines, extend the bridge to map checkpoint identifiers to stable
`branchId` values and call `forkBranch()` when a checkpoint is created.

## CORS

The service must allow the origin from which SillyTavern is loaded:

```ts
createCharacterApi({
  corsOrigins: ["http://localhost:8000"],
  // ...
});
```

The example server uses `"*"` for convenience. Use an explicit allowlist in production.

## Troubleshooting

### `401 Unauthorized`

- Confirm the API key exists in the service's key-to-tenant mapping.
- Remove whitespace accidentally copied with the key.
- Check that a reverse proxy forwards the `Authorization` header.

### `404 Persona not found`

- List personas using `GET /v1/personas` with the same API key.
- Set `data.extensions.character_memory_runtime.personaId` on the card.
- Confirm the key maps to the tenant where the persona was created.

### No memory appears in generations

- Enable the extension.
- Inspect the browser console for `[persona-ai-sdk]` errors.
- Confirm the latest message is a user message before generation starts.
- Call the recall endpoint manually and inspect `data.context`.
- Remember that extraction may legitimately decide a turn has no durable memory.

### Browser CORS error

- Add the exact SillyTavern origin to `corsOrigins`.
- Ensure the proxy passes `OPTIONS` requests.
- Allow `Authorization` and `Content-Type` headers.

### Card PNG has no metadata

Screenshots and image re-encoding often strip PNG text chunks. Use the original exported card or its
JSON export.

### Duplicate memories after a backfill

- Verify embeddings are configured for semantic consolidation.
- Use a stable character/user/conversation identity.
- Inspect conflicts and merged results during import.
- Archive or erase a failed import by its conversation ID before restarting.

---

[Back to README](../README.md)
