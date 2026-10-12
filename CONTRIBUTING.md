<div align="center">

# Contributing

Thank you for helping characters stay coherent, portable, and safe.

[README](./README.md) · [Documentation](./docs/README.md) · [Architecture](./ARCHITECTURE.md)

</div>

---

## Prerequisites

- Node.js 20 or newer
- npm compatible with the committed lockfile
- Git
- A native build environment if your platform cannot use a prebuilt `better-sqlite3` binary

Provider credentials are not required for normal development or CI.

## Set up

```bash
npm install
npm run check
```

The check must pass before and after a change:

1. Prettier formatting check
2. Strict TypeScript type check
3. Deterministic Vitest suite
4. Distribution build

## Development commands

| Command                | Purpose                                    |
| ---------------------- | ------------------------------------------ |
| `npm run build`        | Compile distributable ESM and declarations |
| `npm run format`       | Format code and Markdown                   |
| `npm run format:check` | Check formatting without changing files    |
| `npm run docs:check`   | Verify local Markdown links resolve        |
| `npm test`             | Run deterministic tests once               |
| `npm run test:watch`   | Run tests in watch mode                    |
| `npm run typecheck`    | Check strict TypeScript without emitting   |
| `npm run check`        | Run every required validation step         |
| `npm pack --dry-run`   | Inspect the npm package payload            |

## Change workflow

1. Read the relevant guide and source boundary.
2. Keep the change focused on one user-visible outcome.
3. Add or update deterministic tests.
4. Update the API reference and task guide when behavior changes.
5. Add a changelog entry for notable user-facing changes.
6. Run `npm run check` and `npm pack --dry-run`.
7. Review the diff for credentials, generated junk, unrelated formatting, and accidental breaking
   changes.

Use Conventional Commit-style subjects where practical:

```text
feat(memory): add postgres store adapter
fix(sillytavern): preserve multiline example dialogue
docs(api): document consolidation decisions
test(service): cover tenant isolation
```

Do not alter commit timestamps or fabricate development history.

## Architectural rules

### Core remains provider-neutral

Code in `src/core` must not import OpenAI, AWS, HTTP frameworks, or Node filesystem/database
modules. Define a port in core and implement vendor behavior in an adapter.

### Validate at boundaries

- Validate provider structured output even when the provider claims schema conformance.
- Validate untrusted cards, chat exports, HTTP bodies, and persisted records.
- Preserve source-message provenance.
- Fail before persistence when a batch is inconsistent.

### Preserve canonical records

Store adapters must persist the complete `MemoryRecord`. Embeddings are rebuildable indexes;
content, provenance, lifecycle, visibility, and identity are not.

### Keep tenant isolation explicit

Do not add a production service store that relies only on vector metadata or process-local
filtering. Tenant identity must be part of durable keys and queries.

### Respect licensing boundaries

This repository is MIT licensed. Do not copy AGPL SillyTavern source or third-party extension code
into it. Implement compatibility from public formats and APIs, and preserve required notices for any
new dependency or adapted code.

## Testing expectations

Every public behavior needs a test covering the outcome and relevant failure path.

| Change                | Minimum coverage                                            |
| --------------------- | ----------------------------------------------------------- |
| Core lifecycle        | Created/merged/superseded/conflict result and stored state  |
| Store                 | Round-trip, filtering, and failure/transaction behavior     |
| Provider adapter      | Exact SDK request shape and malformed response handling     |
| Persona               | Compiled instruction or state transition and response trace |
| Importer              | Representative fixture plus malformed input                 |
| Service route         | Authentication, tenant behavior, status, and response body  |
| Documentation example | Typechecked equivalent or nearby tested usage               |

Normal tests must not call paid APIs. Inject provider clients and return deterministic fixtures.

Live smoke tests are explicitly opt-in:

```bash
RUN_LIVE_PROVIDER_TESTS=1 npm test
```

Only run them in an approved account with spend controls.

## Documentation expectations

Documentation follows a layered approach: a navigable README, task tutorials, conceptual
explanation, API reference, contribution guidance, license, and version history.

When adding a public function, document:

- What it does
- Import path
- Parameters and defaults
- Return value
- Side effects
- Failure behavior
- A minimal example when usage is not obvious

Use descriptive filenames, stable headings, relative links, accessible image alt text, and explicit
placeholders. Do not add badges for CI, npm, coverage, security, or compatibility unless the
underlying claim is real and maintained.

## Style

- Prefer plain language and precise names.
- Keep provider terminology at provider boundaries.
- Use ISO 8601 timestamps in data and documentation.
- Explain why a constraint exists when it is not obvious.
- Avoid comments that merely repeat code.
- Avoid introducing a dependency for behavior that is small and auditable.
- Preserve strict TypeScript settings; do not suppress errors with broad `any` casts.

## Compatibility and breaking changes

Version `0.x` may still evolve, but breaking changes should be deliberate. A breaking proposal must
describe:

- Affected imports and types
- Migration path
- Persistence/schema implications
- Provider behavior changes
- Whether old exports or store files remain readable

Store format changes need a forward migration and a fixture proving the previous supported version
still loads, unless the release explicitly documents otherwise.

## Security-sensitive changes

Read [docs/SECURITY.md](./docs/SECURITY.md) before modifying authentication, CORS, tenancy,
visibility, imports, export/erasure, logging, or provider credential handling.

Do not put a vulnerability, credential, or real private conversation into a public issue or test
fixture. Use the hosting platform's private vulnerability-reporting channel for sensitive reports.

## Review checklist

- [ ] The change has one clear outcome
- [ ] Public inputs are validated
- [ ] Tests are deterministic and meaningful
- [ ] Provider calls do not silently change defaults
- [ ] Tenant/user/character identity is preserved
- [ ] Secrets and message content are not logged
- [ ] Relevant documentation and changelog are updated
- [ ] `npm run check` passes
- [ ] `npm pack --dry-run` contains only intended files
- [ ] No unrelated user changes were overwritten

---

By contributing, you agree that your contribution may be distributed under the project's
[MIT License](./LICENSE).
