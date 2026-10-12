<div align="center">

# Documentation

Task-oriented guides for `persona-ai-sdk`.

</div>

---

## Start here

| Goal                          | Guide                                        |
| ----------------------------- | -------------------------------------------- |
| Build the first character     | [Getting started](./GETTING_STARTED.md)      |
| Understand the data model     | [Memory and persona concepts](./CONCEPTS.md) |
| Look up a method or interface | [API reference](./API_REFERENCE.md)          |
| Import or connect SillyTavern | [SillyTavern integration](./SILLYTAVERN.md)  |
| Run the service               | [Deployment](./DEPLOYMENT.md)                |
| Review privacy and threats    | [Security and privacy](./SECURITY.md)        |
| Extend internal boundaries    | [Architecture](../ARCHITECTURE.md)           |
| Contribute a change           | [Contributing](../CONTRIBUTING.md)           |
| Review release changes        | [Changelog](../CHANGELOG.md)                 |

## Documentation conventions

This structure follows the practical checklist in UC Berkeley Library's
[How to Write Good Documentation](https://guides.lib.berkeley.edu/how-to-write-good-documentation):
a concise README, installation, a short tutorial, API details, contributor information, licensing,
and version history.

- Examples target Node.js 20+, ESM, and strict TypeScript.
- Values beginning with `<` and ending with `>` are placeholders.
- Destructive examples are called out explicitly.
- Public API details describe version `0.1.0` and should change with the code.
- Provider model availability, pricing, and account policy can change; verify those with the
  provider.

## Documentation maintenance

Every public behavior change should update:

1. The relevant task guide
2. [API_REFERENCE.md](./API_REFERENCE.md) when a public signature changes
3. [CHANGELOG.md](../CHANGELOG.md) for notable user-facing behavior
4. Tests that demonstrate the documented example

Run `npm run format:check` to validate Markdown formatting and `npm run docs:check` to verify local
links. Both are included in `npm run check`.

---

[Back to project README](../README.md)
