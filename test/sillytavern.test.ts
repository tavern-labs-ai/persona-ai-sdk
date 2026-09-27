import { deflateSync } from "node:zlib";

import { describe, expect, it, vi } from "vitest";

import {
  characterCardToPersona,
  importSillyTavernChat,
  parseCharacterCard,
  parseSillyTavernChat,
} from "../src/sillytavern/index.js";

describe("SillyTavern compatibility", () => {
  const card = {
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: {
      name: "Mira",
      description: "A patient archivist.",
      personality: "warm, observant",
      scenario: "A moonlit library",
      first_mes: "Welcome back.",
      mes_example: "<START>{{user}}: Hello\n{{char}}: Welcome, traveler.",
      character_book: { entries: [{ keys: ["library"], content: "The library moves." }] },
    },
  };

  it("converts V2 JSON cards into personas without dropping portable metadata", () => {
    const parsed = parseCharacterCard(JSON.stringify(card));
    const persona = characterCardToPersona(parsed);
    expect(parsed.spec).toBe("v2");
    expect(persona.name).toBe("Mira");
    expect(persona.identity.traits).toContain("warm");
    expect(persona.examples).toEqual([{ user: "Hello", assistant: "Welcome, traveler." }]);
    expect(persona.metadata.characterBook).toContain("library");
  });

  it("prefers the ccv3 metadata embedded in a PNG", () => {
    const v3 = { ...card, spec: "chara_card_v3", spec_version: "3.0" };
    const png = makePng("ccv3", Buffer.from(JSON.stringify(v3)).toString("base64"));
    expect(parseCharacterCard(png).spec).toBe("v3");
  });

  it("reads compressed PNG text chunks", () => {
    const png = makePng("chara", Buffer.from(JSON.stringify(card)).toString("base64"), true);
    expect(parseCharacterCard(png).data.name).toBe("Mira");
  });

  it("parses and incrementally imports JSONL chats", async () => {
    const chat = parseSillyTavernChat(
      [
        JSON.stringify({ user_name: "Sam", character_name: "Mira", chat_metadata: {} }),
        JSON.stringify({
          name: "Sam",
          is_user: true,
          mes: "I like tea.",
          send_date: "2025-01-01T00:00:00Z",
        }),
        JSON.stringify({
          name: "Mira",
          is_user: false,
          mes: "I'll remember.",
          send_date: "2025-01-01T00:00:01Z",
        }),
      ].join("\n"),
    );
    const ingest = vi
      .fn()
      .mockResolvedValue({ created: [], merged: [], superseded: [], conflicts: [] });
    const progress = vi.fn();
    const result = await importSillyTavernChat({ ingest } as never, chat, {
      characterId: "mira",
      conversationId: "old-chat",
      batchSize: 1,
      onProgress: progress,
    });
    expect(chat.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(result).toMatchObject({ batches: 2, processed: 2 });
    expect(ingest).toHaveBeenCalledTimes(2);
    expect(progress).toHaveBeenLastCalledWith(expect.objectContaining({ processed: 2, total: 2 }));
  });
});

function makePng(keyword: string, text: string, compressed = false): Uint8Array {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const type = Buffer.from(compressed ? "zTXt" : "tEXt");
  const data = compressed
    ? Buffer.concat([
        Buffer.from(keyword + "\0", "latin1"),
        Buffer.from([0]),
        deflateSync(Buffer.from(text)),
      ])
    : Buffer.from(keyword + "\0" + text, "latin1");
  const chunk = Buffer.concat([u32(data.length), type, data, Buffer.alloc(4)]);
  const end = Buffer.concat([u32(0), Buffer.from("IEND"), Buffer.alloc(4)]);
  return Buffer.concat([signature, chunk, end]);
}

function u32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value);
  return buffer;
}
