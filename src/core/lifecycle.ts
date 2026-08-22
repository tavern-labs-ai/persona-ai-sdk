import { cosineSimilarity } from "./scoring.js";
import type { MemoryRecord } from "./schema.js";
import type { ConsolidationDecision, MemoryConsolidationPolicy } from "./types.js";

export interface DefaultConsolidationPolicyOptions {
  duplicateThreshold?: number;
  relatedThreshold?: number;
}

const mutableKinds = new Set<MemoryRecord["kind"]>([
  "state",
  "relationship",
  "preference",
  "promise",
]);

/** Conservative deterministic policy. Applications can inject an LLM-backed policy. */
export class DefaultConsolidationPolicy implements MemoryConsolidationPolicy {
  readonly #duplicateThreshold: number;
  readonly #relatedThreshold: number;

  constructor(options: DefaultConsolidationPolicyOptions = {}) {
    this.#duplicateThreshold = options.duplicateThreshold ?? 0.93;
    this.#relatedThreshold = options.relatedThreshold ?? 0.72;
  }

  decide(candidate: MemoryRecord, existing: readonly MemoryRecord[]): ConsolidationDecision {
    const compatible = existing.filter(
      (memory) =>
        memory.status === "active" &&
        memory.scope === candidate.scope &&
        memory.kind === candidate.kind &&
        sameBranch(memory, candidate),
    );

    const exact = compatible.find(
      (memory) => normalize(memory.content) === normalize(candidate.content),
    );
    if (exact !== undefined) {
      return { action: "merge", existingId: exact.id, reason: "exact normalized duplicate" };
    }

    const nearest = compatible
      .map((memory) => ({ memory, similarity: similarity(candidate, memory) }))
      .sort((left, right) => right.similarity - left.similarity)[0];

    if (nearest === undefined) return { action: "keep", reason: "no related active memory" };
    if (nearest.similarity >= this.#duplicateThreshold) {
      return {
        action: "merge",
        existingId: nearest.memory.id,
        reason: "semantic duplicate",
        similarity: nearest.similarity,
      };
    }

    const sameSubject =
      participantOverlap(candidate, nearest.memory) > 0 ||
      tagOverlap(candidate, nearest.memory) > 0;
    if (
      mutableKinds.has(candidate.kind) &&
      sameSubject &&
      nearest.similarity >= this.#relatedThreshold
    ) {
      return {
        action: "supersede",
        existingId: nearest.memory.id,
        reason: "new mutable state replaces a related active memory",
        similarity: nearest.similarity,
      };
    }

    if (mutableKinds.has(candidate.kind) && sameSubject && nearest.similarity >= 0.5) {
      return {
        action: "conflict",
        existingId: nearest.memory.id,
        reason: "related mutable memories need explicit reconciliation",
        similarity: nearest.similarity,
      };
    }

    return { action: "keep", reason: "distinct memory", similarity: nearest.similarity };
  }
}

function similarity(left: MemoryRecord, right: MemoryRecord): number {
  if (left.embedding !== null && right.embedding !== null) {
    return Math.max(0, cosineSimilarity(left.embedding, right.embedding));
  }
  const leftTerms = terms(left.content);
  const rightTerms = terms(right.content);
  if (leftTerms.size === 0 || rightTerms.size === 0) return 0;
  let intersection = 0;
  for (const term of leftTerms) if (rightTerms.has(term)) intersection += 1;
  return intersection / new Set([...leftTerms, ...rightTerms]).size;
}

function participantOverlap(left: MemoryRecord, right: MemoryRecord): number {
  const rightParticipants = new Set(right.participants.map(normalize));
  return left.participants.filter((participant) => rightParticipants.has(normalize(participant)))
    .length;
}

function tagOverlap(left: MemoryRecord, right: MemoryRecord): number {
  const rightTags = new Set(right.tags.map(normalize));
  return left.tags.filter((tag) => rightTags.has(normalize(tag))).length;
}

function sameBranch(left: MemoryRecord, right: MemoryRecord): boolean {
  return left.branchId === right.branchId;
}

function terms(value: string): Set<string> {
  return new Set(
    normalize(value)
      .split(/[^\p{L}\p{N}_]+/u)
      .filter((term) => term.length > 1),
  );
}

function normalize(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}
