import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";

import { personaManifestSchema, type PersonaManifest } from "../persona/schema.js";

export interface CharacterCardData {
  name: string;
  description?: string;
  personality?: string;
  scenario?: string;
  first_mes?: string;
  mes_example?: string;
  creator_notes?: string;
  system_prompt?: string;
  post_history_instructions?: string;
  tags?: readonly string[];
  creator?: string;
  character_version?: string;
  alternate_greetings?: readonly string[];
  character_book?: unknown;
  extensions?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ParsedCharacterCard {
  spec: "v1" | "v2" | "v3";
  specVersion: string;
  data: CharacterCardData;
  raw: Record<string, unknown>;
}

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** Parse a V1/V2/V3 JSON card or a PNG containing a `chara`/`ccv3` text chunk. */
export function parseCharacterCard(
  input: string | Uint8Array | Record<string, unknown>,
): ParsedCharacterCard {
  const raw =
    typeof input === "string"
      ? parseJsonObject(input)
      : input instanceof Uint8Array
        ? parseCardBytes(input)
        : input;
  const specValue = typeof raw.spec === "string" ? raw.spec : "";
  const spec = specValue === "chara_card_v3" ? "v3" : specValue === "chara_card_v2" ? "v2" : "v1";
  const candidate = spec === "v1" ? raw : raw.data;
  if (!isRecord(candidate) || typeof candidate.name !== "string" || candidate.name.trim() === "") {
    throw new Error("Character card is missing a non-empty name.");
  }
  return {
    spec,
    specVersion: typeof raw.spec_version === "string" ? raw.spec_version : spec.slice(1) + ".0",
    data: candidate as CharacterCardData,
    raw,
  };
}

/** Convert portable card fields into the runtime's provider-neutral persona manifest. */
export function characterCardToPersona(card: ParsedCharacterCard): PersonaManifest {
  const data = card.data;
  const description = text(data.description);
  const personality = text(data.personality);
  const scenario = text(data.scenario);
  const notes = text(data.creator_notes);
  const traits = splitTraits(personality);
  const id = `card-${slug(data.name)}-${createHash("sha256").update(JSON.stringify(card.raw)).digest("hex").slice(0, 10)}`;
  const metadata: Record<string, string> = {
    source: "sillytavern-character-card",
    cardSpec: card.spec,
    cardSpecVersion: card.specVersion,
  };
  copyMetadata(metadata, data, [
    "creator",
    "character_version",
    "first_mes",
    "system_prompt",
    "post_history_instructions",
  ]);
  if (data.tags !== undefined) metadata.tags = JSON.stringify(data.tags);
  if (data.alternate_greetings !== undefined)
    metadata.alternateGreetings = JSON.stringify(data.alternate_greetings);
  if (data.character_book !== undefined)
    metadata.characterBook = JSON.stringify(data.character_book);
  if (data.extensions !== undefined) metadata.extensions = JSON.stringify(data.extensions);

  return personaManifestSchema.parse({
    id,
    version: text(data.character_version) || card.specVersion,
    name: data.name.trim(),
    description: description || personality || `${data.name} imported from a character card.`,
    identity: {
      role: scenario || "Conversational character",
      backstory: [description, scenario].filter(Boolean).join("\n\n"),
      worldview: personality,
      traits: traits.length > 0 ? traits : ["in character"],
      goals: notes ? [notes] : ["Continue the conversation in character"],
    },
    speech: {
      tone: traits.length > 0 ? traits.slice(0, 5) : ["characterful"],
      vocabulary: "neutral",
      verbosity: 0.5,
      humor: 0.3,
      signaturePhrases: [],
      forbiddenPhrases: [],
    },
    behavior: {
      warmth: 0.5,
      assertiveness: 0.5,
      curiosity: 0.6,
      emotionalRange: 0.7,
      stayInCharacter: true,
    },
    boundaries: {
      discloseAi: false,
      rules: [text(data.system_prompt), text(data.post_history_instructions)].filter(Boolean),
      prohibitedTopics: [],
    },
    relationships: {
      stages: ["new", "familiar", "trusted"],
      defaultStage: "new",
      progression: "gradual",
    },
    voice: { voiceId: null, style: traits[0] ?? "natural", pace: 1, expressiveness: 0.7 },
    examples: parseExamples(text(data.mes_example)),
    metadata,
  });
}

function parseCardBytes(bytes: Uint8Array): Record<string, unknown> {
  const buffer = Buffer.from(bytes);
  if (!buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    return parseJsonObject(buffer.toString("utf8"));
  }
  const chunks = readPngTextChunks(buffer);
  const payload = chunks.get("ccv3") ?? chunks.get("chara");
  if (payload === undefined)
    throw new Error("PNG does not contain a ccv3 or chara character-card chunk.");
  return decodeCardPayload(payload);
}

function readPngTextChunks(buffer: Buffer): Map<string, Buffer> {
  const result = new Map<string, Buffer>();
  let offset = PNG_SIGNATURE.length;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const start = offset + 8;
    const end = start + length;
    if (end + 4 > buffer.length) throw new Error("Malformed PNG chunk length.");
    const data = buffer.subarray(start, end);
    if (type === "tEXt") readTextChunk(data, result);
    else if (type === "zTXt") readCompressedTextChunk(data, result);
    else if (type === "iTXt") readInternationalTextChunk(data, result);
    offset = end + 4;
    if (type === "IEND") break;
  }
  return result;
}

function readTextChunk(data: Buffer, result: Map<string, Buffer>): void {
  const separator = data.indexOf(0);
  if (separator < 0) return;
  result.set(data.toString("latin1", 0, separator), data.subarray(separator + 1));
}

function readCompressedTextChunk(data: Buffer, result: Map<string, Buffer>): void {
  const separator = data.indexOf(0);
  if (separator < 0 || separator + 2 > data.length || data[separator + 1] !== 0) return;
  result.set(data.toString("latin1", 0, separator), inflateSync(data.subarray(separator + 2)));
}

function readInternationalTextChunk(data: Buffer, result: Map<string, Buffer>): void {
  const keywordEnd = data.indexOf(0);
  if (keywordEnd < 0 || keywordEnd + 3 > data.length) return;
  const compressed = data[keywordEnd + 1] === 1;
  let cursor = keywordEnd + 3;
  const languageEnd = data.indexOf(0, cursor);
  if (languageEnd < 0) return;
  cursor = languageEnd + 1;
  const translatedEnd = data.indexOf(0, cursor);
  if (translatedEnd < 0) return;
  const payload = data.subarray(translatedEnd + 1);
  result.set(data.toString("latin1", 0, keywordEnd), compressed ? inflateSync(payload) : payload);
}

function decodeCardPayload(payload: Buffer): Record<string, unknown> {
  const source = payload.toString("utf8").trim();
  const attempts = [
    () => parseJsonObject(source),
    () => parseJsonObject(Buffer.from(source, "base64").toString("utf8")),
    () => parseJsonObject(inflateSync(Buffer.from(source, "base64")).toString("utf8")),
  ];
  for (const attempt of attempts) {
    try {
      return attempt();
    } catch {
      // Try the next commonly used character-card encoding.
    }
  }
  throw new Error("Character-card PNG payload is not valid JSON, base64 JSON, or compressed JSON.");
}

function parseJsonObject(source: string): Record<string, unknown> {
  const value: unknown = JSON.parse(source);
  if (!isRecord(value)) throw new Error("Character card must be a JSON object.");
  return value;
}

function parseExamples(source: string): { user: string; assistant: string }[] {
  if (!source) return [];
  const pairs: { user: string; assistant: string }[] = [];
  for (const block of source.split(/<START>/i)) {
    const user = block.match(
      /(?:\{\{user\}\}|<USER>|User)\s*:\s*([\s\S]*?)(?=(?:\{\{char\}\}|<BOT>|Assistant)\s*:)/i,
    )?.[1];
    const assistant = block.match(/(?:\{\{char\}\}|<BOT>|Assistant)\s*:\s*([\s\S]*)/i)?.[1];
    if (user?.trim() && assistant?.trim())
      pairs.push({ user: user.trim(), assistant: assistant.trim() });
  }
  return pairs;
}

function splitTraits(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[,;|\n]+/)
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  ].slice(0, 12);
}

function copyMetadata(
  target: Record<string, string>,
  source: CharacterCardData,
  keys: string[],
): void {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value !== "") target[key] = value;
  }
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "character"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
