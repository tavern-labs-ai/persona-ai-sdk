import type { RecallResult } from "../core/types.js";
import type { PersonaManifest } from "../persona/schema.js";
import { evaluatePersonaResponse, type PersonaEvaluation } from "../persona/evaluate.js";

export interface RetrievalCase {
  name: string;
  query: string;
  expectedMemoryIds: readonly string[];
}

export interface RetrievalEvaluation {
  cases: number;
  hitRate: number;
  meanReciprocalRank: number;
  results: readonly {
    name: string;
    hit: boolean;
    reciprocalRank: number;
    returnedMemoryIds: readonly string[];
  }[];
}

export async function evaluateRetrieval(
  cases: readonly RetrievalCase[],
  recall: (query: string) => Promise<RecallResult>,
): Promise<RetrievalEvaluation> {
  const results = [];
  for (const testCase of cases) {
    const response = await recall(testCase.query);
    const returnedMemoryIds = response.memories.map(({ memory }) => memory.id);
    const rank = returnedMemoryIds.findIndex((id) => testCase.expectedMemoryIds.includes(id));
    results.push({
      name: testCase.name,
      hit: rank >= 0,
      reciprocalRank: rank >= 0 ? 1 / (rank + 1) : 0,
      returnedMemoryIds,
    });
  }
  return {
    cases: cases.length,
    hitRate: average(results.map((result) => (result.hit ? 1 : 0))),
    meanReciprocalRank: average(results.map((result) => result.reciprocalRank)),
    results,
  };
}

export interface PersonaScenario {
  name: string;
  response: string;
}

export interface PersonaSuiteEvaluation {
  score: number;
  results: readonly { name: string; evaluation: PersonaEvaluation }[];
}

export function evaluatePersonaSuite(
  persona: PersonaManifest,
  scenarios: readonly PersonaScenario[],
): PersonaSuiteEvaluation {
  const results = scenarios.map((scenario) => ({
    name: scenario.name,
    evaluation: evaluatePersonaResponse(persona, scenario.response),
  }));
  return { score: average(results.map(({ evaluation }) => evaluation.score)), results };
}

function average(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}
