# Changelog

## 1.0.2 - 2026-10-31

- Strict persona catalog types: bundled persona ids are a `PersonaId` union; cards, summaries, and
  catalogs are readonly; `listPersonas` and `personaIds` return typed results.
- Typed loader cache module: `cache-warm.mjs` is generated with the build and shipped.
- Documentation cleanup in the README.

## 1.0.0 - 2026-10-31

- Initial public release.
- Character memory runtime: extraction, hybrid recall, consolidation, lifecycle controls, atomic
  JSON-file and SQLite stores.
- Provider adapters: OpenAI Responses API and Amazon Bedrock Converse, Titan V2 embeddings,
  character models.
- Persona response runtime with relationship state and JSON state persistence.
- Eight default persona cards: atlas, sage, vera, scout, wren, ember, lumen, mica.
