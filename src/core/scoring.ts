import type { MemoryFilters, MemoryScoreComponents } from "./types.js";
import type { MemoryRecord } from "./schema.js";

const DAY_MS = 86_400_000;
const RECENCY_HALF_LIFE_DAYS = 30;

export function matchesFilters(memory: MemoryRecord, filters: MemoryFilters): boolean {
  if (filters.characterId !== undefined && memory.characterId !== filters.characterId) return false;
  if (filters.userId !== undefined && memory.userId !== filters.userId) return false;
  if (filters.conversationId !== undefined && memory.conversationId !== filters.conversationId) {
    return false;
  }
  if (filters.branchId !== undefined && memory.branchId !== filters.branchId) return false;
  if (filters.branchIds !== undefined && !filters.branchIds.includes(memory.branchId)) return false;
  if (filters.scopes !== undefined && !filters.scopes.includes(memory.scope)) return false;
  if (filters.kinds !== undefined && !filters.kinds.includes(memory.kind)) return false;
  if (filters.statuses !== undefined && !filters.statuses.includes(memory.status)) return false;
  if (filters.visibilities !== undefined && !filters.visibilities.includes(memory.visibility)) {
    return false;
  }
  return true;
}

export function scoreMemory(
  memory: MemoryRecord,
  text: string,
  queryEmbedding: readonly number[] | undefined,
  now: Date,
): { score: number; components: MemoryScoreComponents } {
  const semantic =
    queryEmbedding !== undefined && memory.embedding !== null
      ? normalizeCosine(cosineSimilarity(queryEmbedding, memory.embedding))
      : 0;
  const lexical = lexicalSimilarity(text, `${memory.content} ${memory.tags.join(" ")}`);
  const importance = memory.importance;
  const recency = recencyScore(memory.updatedAt, now);

  const score =
    queryEmbedding !== undefined && memory.embedding !== null
      ? semantic * 0.55 + lexical * 0.2 + importance * 0.15 + recency * 0.1
      : lexical * 0.55 + importance * 0.3 + recency * 0.15;

  return {
    score,
    components: { semantic, lexical, importance, recency },
  };
}

export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;

  let dot = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let index = 0; index < a.length; index += 1) {
    const left = a[index] ?? 0;
    const right = b[index] ?? 0;
    dot += left * right;
    magnitudeA += left * left;
    magnitudeB += right * right;
  }

  if (magnitudeA === 0 || magnitudeB === 0) return 0;
  return dot / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
}

export function lexicalSimilarity(query: string, document: string): number {
  const queryTerms = tokenize(query);
  const documentTerms = tokenize(document);
  if (queryTerms.size === 0 || documentTerms.size === 0) return 0;

  let intersection = 0;
  for (const term of queryTerms) {
    if (documentTerms.has(term)) intersection += 1;
  }

  return intersection / queryTerms.size;
}

function tokenize(value: string): Set<string> {
  return new Set(
    value
      .toLocaleLowerCase()
      .normalize("NFKC")
      .split(/[^\p{L}\p{N}_]+/u)
      .filter((term) => term.length > 1),
  );
}

function recencyScore(updatedAt: string, now: Date): number {
  const ageMs = Math.max(0, now.getTime() - Date.parse(updatedAt));
  const ageDays = ageMs / DAY_MS;
  return Math.exp((-Math.LN2 * ageDays) / RECENCY_HALF_LIFE_DAYS);
}

function normalizeCosine(value: number): number {
  return Math.max(0, Math.min(1, (value + 1) / 2));
}
