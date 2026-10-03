# SillyTavern extension

This installable extension connects SillyTavern's public event API to a hosted `persona-ai-sdk`
service. It recalls context before generation and ingests completed user and character turns
afterward.

For local development, copy this directory into SillyTavern's third-party extensions directory or
put it in its own Git repository and install that URL from SillyTavern's Extensions panel. Configure
the service URL and a tenant-scoped API key in the extension settings.

The character name is used as the persona ID by default. Set
`data.extensions.character_memory_runtime.personaId` in a character card when the service ID
differs.
