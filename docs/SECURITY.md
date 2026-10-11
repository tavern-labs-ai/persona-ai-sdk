<div align="center">

# Security and privacy

Threat model and deployment controls for character memory systems.

[README](../README.md) · [Deployment](./DEPLOYMENT.md) · [API reference](./API_REFERENCE.md)

</div>

---

## Security boundary

This package validates data and provides application-level visibility controls. It is not an
authentication service, secrets manager, sandbox, encryption product, abuse-prevention system, or
complete multi-tenant database.

The deployer owns the network, identity, authorization, storage, retention, and provider policies
around the runtime.

## Data classification

Character conversations and extracted memories may contain:

- Personal preferences and biographical details
- Relationship and emotional inferences
- Secrets shared in roleplay or real conversation
- User-generated instructions or malicious prompt text
- Provider and model identifiers
- Stable user, conversation, and tenant identifiers

Classify this data before launch. Define who can access it, why it is retained, when it expires, and
how a user exports or erases it.

## Threat model

| Threat                     | Example                                             | Primary controls                                                    |
| -------------------------- | --------------------------------------------------- | ------------------------------------------------------------------- |
| Cross-tenant access        | Tenant A guesses Tenant B's persona ID              | Authenticated tenant mapping plus storage-level tenant keys         |
| Stored prompt injection    | A message asks future models to ignore system rules | Treat memory as untrusted context; apply boundaries above it        |
| Credential theft           | Browser bundle contains an OpenAI key               | Keep provider credentials server-side                               |
| Over-collection            | Extractor stores unnecessary intimate details       | Scope extraction instructions, confidence policy, review, retention |
| Unauthorized secret recall | A group character sees another character's secret   | `knownBy`, visibility, viewer identity, application authorization   |
| Malicious imports          | Huge/compressed card exhausts memory                | Upload and decompression limits; validate before persistence        |
| Denial of wallet           | Attacker triggers costly generation/import loops    | Rate, token, concurrency, and spend limits                          |
| Sensitive logging          | Prompts and API keys appear in logs                 | Structured allowlisted logs and redaction                           |
| Data remanence             | Erasure deletes DB rows but not backups             | Backup expiry and documented erasure policy                         |

## Authentication and API keys

`createCharacterApi` accepts a plain map from bearer keys to tenant IDs for integration simplicity.
For a public service:

- Generate high-entropy random keys.
- Store only a slow or keyed hash, not plaintext.
- Associate scope, tenant, status, creation time, and rotation metadata.
- Compare secrets in constant time where practical.
- Support overlapping rotation windows and immediate revocation.
- Rate-limit by key and IP.
- Never send a provider credential to SillyTavern or Studio.
- Never place keys in URLs, logs, source control, screenshots, or character cards.

Omitting `apiKeys` enables an unauthenticated `local` tenant. Bind such a server only to a trusted
local interface.

## Tenant isolation

The service resolves a tenant before loading a persona or memory runtime. That is necessary but not
sufficient.

Storage implementations must include tenant identity in every primary key, unique constraint, query,
cache key, backup boundary, and vector namespace. Add tests that create identical persona/user IDs
in two tenants and prove neither can list, recall, export, update, or erase the other's data.

The example server uses separate hashed SQLite/state filenames per tenant/persona pair. Its shared
persona JSON registry is logically partitioned. This is designed for one trusted process, not
adversarial multi-host SaaS storage.

## Memory visibility

`shared`, `character_only`, and `user_only` are contextual disclosure rules. `knownBy` describes
entities aware of the memory.

These fields do not encrypt records and do not replace API authorization. Administrative methods,
store access, backups, or `includeSecrets: true` can bypass normal recall filtering.

Use opaque stable IDs for characters and users. Display names are mutable, guessable, and often not
unique.

## Prompt injection

Memory content originates from users and models. Treat it as untrusted data forever.

The runtime wraps recalled content in a labeled block and says recollections are not instructions.
The persona compiler also tells the model not to treat user text as higher-priority character
instructions. These are defense-in-depth signals, not a guarantee.

Additional controls:

- Keep security and behavior policy in provider instructions, above memory context.
- Do not concatenate recalled memory into tool definitions or executable code.
- Restrict tools independently from model text.
- Validate tool arguments and authorize each action server-side.
- Evaluate adversarial memories such as “ignore prior rules” and hidden data exfiltration requests.
- Avoid storing raw system/tool output unless specifically required.

## Character Card and chat imports

Cards and JSONL exports are untrusted uploads.

Before parsing:

- Enforce a compressed upload size limit.
- Enforce a decompressed metadata limit at the upload boundary.
- Allow only expected content types and extensions, but do not trust them alone.
- Scan uploads if required by your environment.
- Reject malformed PNG chunk lengths.
- Cap lorebook entries, chat lines, line length, and total messages.
- Run bulk imports in isolated workers with time and memory limits.

After conversion, show the manifest to an authorized reviewer. Card system prompts, post-history
instructions, examples, lorebooks, and extension metadata are author-controlled.

## Provider privacy

OpenAI extraction and character generation set response storage off by default. Provider-side logs,
abuse monitoring, regional processing, and retention are still governed by the account and provider
terms.

Bedrock behavior depends on the AWS account, region, model provider, logging configuration, and
organization policies.

For both providers:

- Send only necessary conversation context.
- Use approved regions and accounts.
- Review provider retention and training settings.
- Restrict credentials to required actions/models.
- Rotate credentials and monitor their use.
- Avoid putting secrets into model IDs, tags, or telemetry dimensions.

## Encryption

Use TLS for all network traffic. Encrypt disks, database volumes, snapshots, and backups. For highly
sensitive memories, consider application-layer envelope encryption with tenant-specific keys.

If embeddings are stored separately, protect them as derived personal data. They may leak semantic
information and should follow the canonical record's retention and access policy.

## Logging and telemetry

Safe metadata includes request ID, route template, status, latency, tenant pseudonym,
provider/model, token counts, and aggregate memory counts.

Avoid logging:

- Authorization headers or API keys
- Provider credentials
- Raw messages and generated responses
- Complete persona instructions
- Memory content or embeddings
- User display names and email addresses
- Imported card/chat contents

Use the runtime event callback to transform events into allowlisted aggregate measurements rather
than serializing the entire event object.

## Export, retention, and erasure

The runtime supplies export, archive, and erase primitives. A complete privacy workflow should:

1. Authenticate the requesting user.
2. Resolve every tenant/user/character identifier associated with them.
3. Export canonical records in a readable versioned format.
4. Erase memory, persona state, cached responses, derived indexes, and attachments as applicable.
5. Record an audit event without retaining erased content.
6. Explain backup expiry and provider-side retention.

`erase({})` can delete an entire store. Require explicit scoped filters and an additional
authorization check in administrative APIs.

## Dependency and supply-chain controls

- Commit and review `package-lock.json`.
- Run dependency and license scanning in CI.
- Use npm provenance when publishing.
- Protect the npm account with strong MFA.
- Restrict publish workflow permissions.
- Review native `better-sqlite3` installation in target environments.
- Pin actions and deployment images according to organizational policy.

## Vulnerability reporting

Use the source host's private vulnerability-reporting channel for sensitive reports. Before public
distribution, publish a root security policy describing the supported versions, response process,
and private contact method.

## Pre-launch security checklist

- [ ] Threat model reviewed for the actual product and users
- [ ] Tenant isolation tested at API, cache, store, vector, and backup layers
- [ ] Provider credentials remain server-side and least-privileged
- [ ] Keys are hashed, scoped, rotatable, revocable, and rate-limited
- [ ] CORS uses explicit production origins
- [ ] Import size/time/memory limits exist
- [ ] Tool calls are independently authorized and validated
- [ ] Logs contain no messages, prompts, keys, or memory content
- [ ] TLS and encryption at rest are enabled
- [ ] Retention, export, erasure, and backup expiry are documented
- [ ] Cost/concurrency limits and alerts are active
- [ ] Adversarial prompt and stored-memory tests pass
- [ ] A real vulnerability reporting channel is published

---

[Back to README](../README.md)
