# Contributing

## Local checks

```bash
npm install
npm run check
```

Tests must not call paid APIs. Inject provider clients and use deterministic responses.

## Architectural rules

- Core must not import vendor SDKs or Node filesystem modules.
- Provider output must be validated at the boundary.
- Store adapters must preserve the canonical memory record.
- New public behavior requires tests and documentation.
- Do not copy code from AGPL SillyTavern extensions into this MIT project.

Use Conventional Commit-style subjects where practical, for example `feat: add sqlite store`.
