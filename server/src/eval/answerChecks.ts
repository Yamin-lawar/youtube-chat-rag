import { NOT_FOUND_ANSWER } from '../rag/generation/chatModelGenerator.js';
import type { Source } from '../rag/generation/types.js';
import { chunkCoversSpan } from './evidence.js';
import type { TimeSpan } from './types.js';

// The prompt tells the model to "say you could not find it in the selected videos". Models
// word that in many ways, so we look for the few phrases that mean "the excerpts do not have it".
// Checked by reading real answers (see docs/EXPERIMENTS.md, E10), not guessed.
const REFUSAL_PATTERNS = [
  /\b(?:could|can)(?:\s?not|n['’]t)\s+(?:find|see|locate)\b/i,
  /\b(?:do(?:es)?\s+not|don['’]t|doesn['’]t)\s+(?:contain|mention|cover|discuss|include|say|talk about|address)\b/i,
  /\bno (?:mention|information|details?|reference)\b/i,
  /\bnot (?:mentioned|covered|discussed|addressed)\b/i,
  /\bnothing (?:about|in the (?:excerpts|selected videos))\b/i,
];

/**
 * True when the answer says the videos do not contain the answer. It looks at the first
 * 300 characters only: a refusal comes first, and a long real answer may say "does not mention"
 * about one small detail without being a refusal.
 */
export function isRefusal(answerText: string): boolean {
  if (answerText.trim() === NOT_FOUND_ANSWER) return true;
  const opening = answerText.slice(0, 300);
  return REFUSAL_PATTERNS.some((pattern) => pattern.test(opening));
}

/** The excerpt numbers an answer cites, in order, without repeats: "see [2][3] and [2]" gives [2, 3]. */
export function citedNumbers(answerText: string): number[] {
  const numbers = [...answerText.matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1]));
  return [...new Set(numbers)];
}

/**
 * True when at least one excerpt the answer cites contains labelled evidence. A cited excerpt
 * counts when its time range overlaps an evidence span, the same rule the retrieval eval uses.
 * An answer with no valid citation scores false: it could not be traced to the right place.
 */
export function citesEvidence(
  answerText: string,
  sources: Array<Pick<Source, 'youtubeId' | 'startMs' | 'endMs'>>,
  evidence: TimeSpan[][],
): boolean {
  const spans = evidence.flat();
  return citedNumbers(answerText).some((number) => {
    const source = sources[number - 1];
    return source !== undefined && spans.some((span) => chunkCoversSpan(source, span));
  });
}

/**
 * Of the excerpts the answer cites, the share that contain labelled evidence (0 to 1), or null
 * when it cites no existing excerpt. Stricter than `citesEvidence`: an answer that cites nine
 * excerpts and gets one right scores 0.11, while it still counts as a hit there.
 */
export function citationPrecision(
  answerText: string,
  sources: Array<Pick<Source, 'youtubeId' | 'startMs' | 'endMs'>>,
  evidence: TimeSpan[][],
): number | null {
  const spans = evidence.flat();
  const cited = citedNumbers(answerText)
    .map((number) => sources[number - 1])
    .filter((source) => source !== undefined);
  if (cited.length === 0) return null;
  const correct = cited.filter((source) => spans.some((span) => chunkCoversSpan(source, span)));
  return correct.length / cited.length;
}
