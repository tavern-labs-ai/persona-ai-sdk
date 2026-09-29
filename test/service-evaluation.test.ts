import { describe, expect, it, vi } from "vitest";

import { evaluateRetrieval } from "../src/evaluation/index.js";
import { characterCardToPersona, parseCharacterCard } from "../src/sillytavern/index.js";
import { createCharacterApi } from "../src/service/index.js";

const persona = characterCardToPersona(
  parseCharacterCard({
    name: "Nova",
    description: "A mechanic",
    personality: "warm",
    scenario: "Space",
    first_mes: "Hi",
    mes_example: "",
  }),
);

describe("service and evaluation adapters", () => {
  it("authenticates tenant keys and exposes the persona response endpoint", async () => {
    const respond = vi.fn().mockResolvedValue({ text: "Hello", trace: {} });
    const api = createCharacterApi({
      apiKeys: { secret: "tenant-a" },
      createRuntime: () => ({ respond }) as never,
      getMemory: () => ({ export: vi.fn(), erase: vi.fn() }) as never,
    });
    expect((await api(new Request("http://local/v1/personas"))).status).toBe(401);
    const headers = { authorization: "Bearer secret", "content-type": "application/json" };
    const created = await api(
      new Request("http://local/v1/personas", {
        method: "POST",
        headers,
        body: JSON.stringify(persona),
      }),
    );
    expect(created.status).toBe(201);
    const response = await api(
      new Request(`http://local/v1/personas/${persona.id}/respond`, {
        method: "POST",
        headers,
        body: JSON.stringify({ message: "Hi", conversationId: "chat" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(respond).toHaveBeenCalledWith(expect.objectContaining({ message: "Hi" }));
  });

  it("calculates retrieval hit rate and reciprocal rank", async () => {
    const report = await evaluateRetrieval(
      [{ name: "lake", query: "lake", expectedMemoryIds: ["right"] }],
      async () => ({
        context: "",
        estimatedTokens: 0,
        memories: [
          { memory: { id: "wrong" } as never, score: 1, components: {} as never },
          { memory: { id: "right" } as never, score: 0.9, components: {} as never },
        ],
      }),
    );
    expect(report.hitRate).toBe(1);
    expect(report.meanReciprocalRank).toBe(0.5);
  });
});
