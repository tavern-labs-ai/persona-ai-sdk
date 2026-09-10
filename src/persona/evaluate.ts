import type { PersonaManifest } from "./schema.js";

export interface PersonaEvaluation {
  score: number;
  violations: readonly string[];
  metrics: {
    forbiddenPhraseRate: number;
    verbosityFit: number;
    identityLeak: number;
  };
}

export function evaluatePersonaResponse(
  persona: PersonaManifest,
  response: string,
): PersonaEvaluation {
  const normalized = response.toLocaleLowerCase();
  const violations = persona.speech.forbiddenPhrases
    .filter((phrase) => normalized.includes(phrase.toLocaleLowerCase()))
    .map((phrase) => `Used forbidden phrase: ${phrase}`);
  const wordCount = response.trim().length === 0 ? 0 : response.trim().split(/\s+/).length;
  const targetWords = 20 + persona.speech.verbosity * 180;
  const verbosityFit = Math.max(
    0,
    1 - Math.abs(wordCount - targetWords) / Math.max(targetWords, 1),
  );
  const identityLeak = /\b(system prompt|developer message|language model instructions)\b/i.test(
    response,
  )
    ? 1
    : 0;
  if (identityLeak > 0) violations.push("Exposed internal instruction terminology.");
  const forbiddenPhraseRate =
    persona.speech.forbiddenPhrases.length === 0
      ? 0
      : violations.filter((item) => item.startsWith("Used forbidden")).length /
        persona.speech.forbiddenPhrases.length;
  const score = Math.max(
    0,
    Math.min(1, verbosityFit * 0.25 + (1 - forbiddenPhraseRate) * 0.5 + (1 - identityLeak) * 0.25),
  );

  return { score, violations, metrics: { forbiddenPhraseRate, verbosityFit, identityLeak } };
}
