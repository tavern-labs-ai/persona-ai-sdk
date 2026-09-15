import type { CharacterMemoryRuntime } from "../core/runtime.js";
import { personaManifestSchema, type PersonaManifest } from "../persona/schema.js";
import type { PersonaRuntime } from "../persona/runtime.js";
import { InMemoryPersonaRegistry, type PersonaRegistry } from "./registry.js";

export interface CharacterApiOptions {
  /** API key to stable tenant ID. Omit only for trusted local development. */
  apiKeys?: Readonly<Record<string, string>>;
  /** Allowed browser origins for Studio/SillyTavern. Omit to disable CORS. */
  corsOrigins?: readonly string[] | "*";
  registry?: PersonaRegistry;
  createRuntime(input: {
    tenantId: string;
    persona: PersonaManifest;
  }): Promise<PersonaRuntime> | PersonaRuntime;
  getMemory(input: {
    tenantId: string;
    personaId: string;
  }): Promise<CharacterMemoryRuntime> | CharacterMemoryRuntime;
}

export function createCharacterApi(
  options: CharacterApiOptions,
): (request: Request) => Promise<Response> {
  const registry = options.registry ?? new InMemoryPersonaRegistry();
  const runtimes = new Map<string, PersonaRuntime>();

  const handle = async (request: Request): Promise<Response> => {
    try {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/health") return json({ status: "ok" });
      const tenantId = authenticate(request, options.apiKeys);
      if (tenantId === null) return json({ error: "Unauthorized" }, 401);
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts[0] !== "v1") return json({ error: "Not found" }, 404);

      if (request.method === "GET" && parts[1] === "personas" && parts.length === 2) {
        return json({ data: await registry.list(tenantId) });
      }
      if (request.method === "POST" && parts[1] === "personas" && parts.length === 2) {
        const persona = personaManifestSchema.parse(await request.json());
        await registry.set(tenantId, persona);
        runtimes.delete(cacheKey(tenantId, persona.id));
        return json({ data: persona }, 201);
      }

      const personaId = parts[2];
      if (parts[1] !== "personas" || personaId === undefined)
        return json({ error: "Not found" }, 404);
      const persona = await registry.get(tenantId, personaId);
      if (persona === null) return json({ error: "Persona not found" }, 404);

      if (request.method === "DELETE" && parts.length === 3) {
        await registry.delete(tenantId, personaId);
        runtimes.delete(cacheKey(tenantId, personaId));
        return new Response(null, { status: 204 });
      }
      if (request.method === "POST" && parts[3] === "respond") {
        const body = asRecord(await request.json());
        if (typeof body.message !== "string" || typeof body.conversationId !== "string") {
          return json({ error: "message and conversationId are required" }, 400);
        }
        const key = cacheKey(tenantId, personaId);
        let runtime = runtimes.get(key);
        if (runtime === undefined) {
          runtime = await options.createRuntime({ tenantId, persona });
          runtimes.set(key, runtime);
        }
        return json({ data: await runtime.respond(body as never) });
      }
      if (request.method === "GET" && parts[3] === "memories") {
        const memory = await options.getMemory({ tenantId, personaId });
        return json({ data: await memory.export({ characterId: personaId }) });
      }
      if (request.method === "POST" && parts[3] === "memories" && parts[4] === "recall") {
        const memory = await options.getMemory({ tenantId, personaId });
        const body = asRecord(await request.json());
        if (typeof body.query !== "string") return json({ error: "query is required" }, 400);
        return json({ data: await memory.recall({ ...body, characterId: personaId } as never) });
      }
      if (request.method === "POST" && parts[3] === "memories" && parts[4] === "ingest") {
        const memory = await options.getMemory({ tenantId, personaId });
        const body = asRecord(await request.json());
        if (typeof body.conversationId !== "string" || !Array.isArray(body.messages)) {
          return json({ error: "conversationId and messages are required" }, 400);
        }
        return json({ data: await memory.ingest({ ...body, characterId: personaId } as never) });
      }
      if (request.method === "DELETE" && parts[3] === "memories") {
        const memory = await options.getMemory({ tenantId, personaId });
        return json({ deleted: await memory.erase({ characterId: personaId }) });
      }
      return json({ error: "Not found" }, 404);
    } catch (error) {
      if (error instanceof SyntaxError) return json({ error: "Invalid JSON" }, 400);
      const message = error instanceof Error ? error.message : "Internal error";
      return json({ error: message }, 422);
    }
  };
  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }), request, options.corsOrigins);
    }
    return withCors(await handle(request), request, options.corsOrigins);
  };
}

function authenticate(request: Request, keys: CharacterApiOptions["apiKeys"]): string | null {
  if (keys === undefined) return "local";
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  return keys[authorization.slice(7)] ?? null;
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "cache-control": "no-store" } });
}

function cacheKey(tenantId: string, personaId: string): string {
  return `${tenantId}:${personaId}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new SyntaxError("Expected a JSON object.");
  return value as Record<string, unknown>;
}

function withCors(
  response: Response,
  request: Request,
  allowed: CharacterApiOptions["corsOrigins"],
): Response {
  if (allowed === undefined) return response;
  const origin = request.headers.get("origin");
  const matched =
    allowed === "*" ? "*" : origin !== null && allowed.includes(origin) ? origin : null;
  if (matched === null) return response;
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", matched);
  headers.set("access-control-allow-headers", "authorization, content-type");
  headers.set("access-control-allow-methods", "GET, POST, DELETE, OPTIONS");
  headers.append("vary", "origin");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
