<div align="center">

# Memory and persona concepts

The mental model behind the runtime.

[README](../README.md) · [Getting started](./GETTING_STARTED.md) ·
[API reference](./API_REFERENCE.md)

</div>

---

## Persona is not memory

A persona describes who a character should consistently be. Memory describes what happened, what is
currently true, and what the character knows.

| Persona                            | Memory                                         |
| ---------------------------------- | ---------------------------------------------- |
| Authored and versioned             | Extracted from conversations                   |
| Stable identity and behavior       | Changes continuously                           |
| Shared across appropriate sessions | Often user-, conversation-, or branch-specific |
| Compiled into model instructions   | Rendered as untrusted contextual recollection  |

Keeping these separate prevents one unusual conversation from silently rewriting the character's
core identity.

## The canonical memory record

Every stored memory is a structured `MemoryRecord`, not a raw transcript fragment.

| Field group     | Purpose                                                       |
| --------------- | ------------------------------------------------------------- |
| Identity        | `id`, `characterId`, `userId`, `conversationId`, `branchId`   |
| Meaning         | `scope`, `kind`, `content`, `participants`, `tags`            |
| Quality         | `importance`, `confidence`                                    |
| Evidence        | `sourceMessageIds`                                            |
| Knowledge       | `knownBy`, `visibility`                                       |
| Time            | `occurredAt`, `validUntil`, creation/update/recall timestamps |
| Lifecycle       | `status`, `supersedes`, recall count                          |
| Retrieval index | embedding vector, provider, and model                         |

Embeddings are derived indexes. The human-readable content and provenance remain canonical, so a
vector model can be replaced using `reembed()`.

## Scopes

Scopes answer “what does this memory belong to?”

| Scope          | Typical examples                                       |
| -------------- | ------------------------------------------------------ |
| `character`    | Nova fears deep water; Nova owns a red toolkit         |
| `user`         | Alice prefers jasmine tea; Alice works nights          |
| `relationship` | Nova trusts Alice; they promised to visit the lake     |
| `conversation` | The current scene takes place in a damaged engine room |
| `world`        | Kepler Station orbits a red dwarf                      |

Scope is independent from visibility. A world fact can still be secret, and a relationship memory
can be shared.

## Kinds

Kinds answer “what type of statement is this?”

| Kind           | Meaning                                 |
| -------------- | --------------------------------------- |
| `fact`         | A durable descriptive statement         |
| `event`        | Something that happened                 |
| `preference`   | A like, dislike, or choice tendency     |
| `relationship` | A social bond or relationship state     |
| `promise`      | A commitment or plan                    |
| `secret`       | Information with constrained knowledge  |
| `state`        | Mutable current condition               |
| `story_arc`    | A compacted summary of multiple records |

Mutable kinds—state, relationship, preference, and promise—receive special consolidation treatment
because newer information may replace older information.

## Provenance

The extractor must cite source message IDs. During ingestion, the runtime removes IDs that were not
present in the supplied input. A candidate with no valid source IDs is discarded.

This constraint matters because structured output guarantees a shape, not truth. Provenance gives
operators a way to inspect why a memory exists and prevents the extractor from citing invented
messages.

## Confidence and importance

- **Confidence** measures how well the conversation supports the extracted claim. Candidates below
  the runtime's `minimumConfidence` are not stored.
- **Importance** measures how useful the claim is likely to be later. Importance contributes to
  recall ranking.

These values have different meanings. An unimportant observation can be very certain; an important
inference can still be uncertain.

## Consolidation

Each candidate receives one decision:

| Decision    | Result                                                                         |
| ----------- | ------------------------------------------------------------------------------ |
| `merge`     | Evidence, participants, tags, and quality are combined with an existing record |
| `supersede` | The older active record becomes superseded and the new record points to it     |
| `conflict`  | Both are retained and the conflict is returned for application review          |
| `keep`      | A new independent memory is created                                            |

The default policy performs normalized exact matching and, when embeddings exist, cosine-based
semantic comparison. Its defaults are conservative: semantic duplicates require `0.93` similarity,
while related mutable state can supersede at `0.72` when subjects or tags overlap.

Applications with domain-specific truth rules can implement `MemoryConsolidationPolicy`.

## Visibility and knowledge

Visibility controls which viewer can receive a memory:

- `shared`: visible in ordinary recall
- `character_only`: visible when the viewing character appears in `knownBy`
- `user_only`: visible when the requesting user appears in `knownBy`

Secrets default to character-only visibility during extraction. `includeSecrets: true` bypasses the
normal visibility check and should only be used in trusted administrative flows.

> [!WARNING] Visibility is an application-layer control, not encryption. Use database permissions
> and separate tenant partitions to protect stored records.

## Recall

Recall applies identity and lifecycle filters, excludes expired records, scores candidates, applies
visibility, then packs the best records into a token budget.

With embeddings, the score is:

```text
55% semantic + 20% lexical + 15% importance + 10% recency
```

Without embeddings:

```text
55% lexical + 30% importance + 15% recency
```

Recency uses a 30-day half-life. The store returns component scores to support debugging and
evaluation.

The renderer wraps results in `<retrieved_memories>` and states that they are recollections, not
instructions. This reduces—but does not eliminate—the risk of stored prompt injection.

## Branches and checkpoints

`branchId` namespaces alternate timelines. A recall for a named branch sees global records with a
null branch plus records from that branch.

`forkBranch()` copies matching records into a destination branch with new IDs and reset recall
counters. The source branch remains intact.

Choose stable opaque branch IDs. Do not use display labels that users can rename.

## Story-arc compaction

Long-running characters can accumulate many small events. `compact()` passes matching active records
to a supplied `MemoryCompactor`, creates one `story_arc`, and optionally archives the source
records.

The runtime deliberately does not prescribe how summaries are written. A deterministic compactor,
local model, OpenAI model, or Bedrock model can implement the same interface.

Compaction should be treated as lossy. Keep source records archived until retention policy allows
deletion, and evaluate whether the story arc preserves important commitments and secrets.

## Persona state

Persona state is keyed by character, user, and branch. It contains:

- Relationship stage
- Trust, familiarity, affection, and tension
- Current emotional label, valence, arousal, and intensity
- Turn count and update time

The built-in state evolution is intentionally predictable. Familiarity and trust rise slowly;
arousal and emotional intensity decay. Applications can own more sophisticated sentiment or
relationship logic outside the runtime.

## Prompt compilation

The compiler combines validated persona fields, state, channel guidance, relevant memory, and
dialogue examples. It produces:

- `instructions`: the provider-neutral character instructions
- `fingerprint`: a short SHA-256-derived identifier for observability and drift comparisons

Channel guidance changes presentation rather than identity. Voice requests prefer short speakable
sentences; game requests avoid deciding for the player; social requests are concise and
privacy-aware.

## Failure model

The runtime favors explicit failure over partially valid state:

- Invalid provider JSON throws `ProviderResponseError`.
- Schema-invalid records are rejected.
- Embedding count mismatches fail before persistence.
- Atomic JSON writes use a temporary file and rename.
- SQLite batches use transactions.
- Unsupported export versions are rejected.

Provider generation and subsequent ingestion are two external operations. A generated response can
exist before ingestion fails; the calling application owns retry and degraded-response policy.

---

[Back to README](../README.md)
