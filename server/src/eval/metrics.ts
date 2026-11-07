import { chunkCoversSpan } from './evidence.js';
import type { TimeSpan } from './types.js';

/** The part of a retrieved chunk the metrics need. */
export interface RankedChunk {
  youtubeId: string;
  startMs: number;
  endMs: number;
}

/** The k values we report: "is the answer in the top 1, 3, 5, 10 chunks?" */
export const CUTOFFS = [1, 3, 5, 10] as const;

export interface QuestionScore {
  /** Position (1 = best) of the first chunk that covers any correct passage, or null if none. */
  firstRank: number | null;
  /** 1 / firstRank, or 0 when no correct chunk was returned. Averaged over questions this is MRR. */
  reciprocalRank: number;
  /** For each k: 1 if a correct chunk is among the top k, else 0. Averaged this is the hit rate. */
  hitAt: Record<number, number>;
  /** For each k: the share of the correct passages that are covered by the top k chunks. */
  recallAt: Record<number, number>;
  /** For each k: the share of the top k chunks that are correct (cover a correct passage). */
  precisionAt: Record<number, number>;
  /** For each k: the highest precision any ranking could reach, since only a few chunks are correct. */
  bestPrecisionAt: Record<number, number>;
  /** For each k: nDCG, which rewards correct chunks for being near the top (1 = perfect order). */
  ndcgAt: Record<number, number>;
}

/** The discount in nDCG: a correct chunk at rank 1 counts fully, at rank 3 only half. */
const discount = (rank: number) => 1 / Math.log2(rank + 1);

/** The share of the correct passages that at least one of the given chunks covers. */
export function evidenceRecall(chunks: RankedChunk[], evidence: TimeSpan[][]): number {
  if (evidence.length === 0) return 0;
  const found = evidence.filter((passage) =>
    chunks.some((chunk) => passage.some((span) => chunkCoversSpan(chunk, span))),
  ).length;
  return found / evidence.length;
}

/**
 * Scores one question.
 *
 * `ranked` is what retrieval returned, best first. `evidence` has one entry per correct passage,
 * each with the time span(s) where it is said (one passage may be covered by two overlapping chunks).
 * `relevantInPool` is how many chunks of the selected videos are correct, which sets the best
 * possible precision and nDCG.
 */
export function scoreQuestion(
  ranked: RankedChunk[],
  evidence: TimeSpan[][],
  relevantInPool: number,
): QuestionScore {
  const covers = (chunk: RankedChunk, passage: TimeSpan[]) =>
    passage.some((span) => chunkCoversSpan(chunk, span));

  const index = ranked.findIndex((chunk) => evidence.some((passage) => covers(chunk, passage)));
  const firstRank = index === -1 ? null : index + 1;

  const isCorrect = (chunk: RankedChunk) => evidence.some((passage) => covers(chunk, passage));

  const hitAt: Record<number, number> = {};
  const recallAt: Record<number, number> = {};
  const precisionAt: Record<number, number> = {};
  const bestPrecisionAt: Record<number, number> = {};
  const ndcgAt: Record<number, number> = {};
  for (const k of CUTOFFS) {
    const top = ranked.slice(0, k);
    hitAt[k] = firstRank !== null && firstRank <= k ? 1 : 0;
    recallAt[k] = evidenceRecall(top, evidence);

    // Precision divides by k even if fewer chunks came back: missing slots are not correct.
    precisionAt[k] = top.filter(isCorrect).length / k;
    bestPrecisionAt[k] = Math.min(k, relevantInPool) / k;

    // nDCG compares the order we got with the best possible order (all correct chunks first).
    const dcg = top.reduce((sum, chunk, i) => sum + (isCorrect(chunk) ? discount(i + 1) : 0), 0);
    let ideal = 0;
    for (let rank = 1; rank <= Math.min(k, relevantInPool); rank++) ideal += discount(rank);
    ndcgAt[k] = ideal === 0 ? 0 : dcg / ideal;
  }

  return {
    firstRank,
    reciprocalRank: firstRank === null ? 0 : 1 / firstRank,
    hitAt,
    recallAt,
    precisionAt,
    bestPrecisionAt,
    ndcgAt,
  };
}

/**
 * The hit rate you would get by picking k chunks completely at random from the selected videos.
 * It is the yardstick for "is this score actually good?": a short video makes even random
 * guessing look good, and a result near this number means retrieval is adding nothing.
 *
 * `poolSize` is how many chunks the selected videos have, `relevant` how many of them cover the answer.
 */
export function randomHitAtK(poolSize: number, relevant: number, k: number): number {
  if (relevant <= 0) return 0;
  if (k >= poolSize || poolSize - relevant < k) return 1;

  // Probability that all k picks miss, one pick at a time.
  let allMiss = 1;
  for (let i = 0; i < k; i++) allMiss *= (poolSize - relevant - i) / (poolSize - i);
  return 1 - allMiss;
}

export function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;
}
