import type { ScoredChunk } from '../vectorstore/qdrantChunkStore.js';

/** The usual constant in the RRF formula. A larger value makes the ranks count more evenly. */
export const RRF_K = 60;

export interface FusionOptions {
  /** The constant in 1 / (k + rank). Default RRF_K. */
  k?: number;
  /**
   * How much each list's vote counts, one number per list in the same order. Default: all 1.
   * With weights [1, 0.5] a chunk earns half as many points from the second list. A weight of 0
   * mutes a list: its chunks are only used to fill up the result when the others run out.
   */
  weights?: number[];
}

/**
 * Reciprocal Rank Fusion: merges several ranked lists of chunks into one.
 *
 * Each chunk earns weight / (k + rank) from every list it appears in (rank starts at 1, the
 * weight is 1 unless given), and the earned points are added up. A chunk near the top of both
 * lists beats a chunk that is first in one list and missing from the other. Only the rank is
 * used, never the score, which is why it can merge cosine scores and keyword scores that are
 * not comparable.
 *
 *   dense list:   A, B, C        sparse list:   C, A
 *   A: 1/61 + 1/62 = 0.0325      B: 1/62 = 0.0161      C: 1/63 + 1/61 = 0.0323
 *   fused:        A, C, B
 *
 * Chunks are the same when `youtubeId` and `chunkIndex` match. The returned `score` is the
 * summed points, and the list is sorted best first and cut to `limit`. When two chunks end up
 * with the same points, the one seen first (earlier list, higher rank) comes first. Each input
 * list is expected to hold a chunk at most once.
 */
export function reciprocalRankFusion(
  rankings: ScoredChunk[][],
  limit: number,
  { k = RRF_K, weights = rankings.map(() => 1) }: FusionOptions = {},
): ScoredChunk[] {
  if (weights.length !== rankings.length) {
    throw new RangeError(`Got ${rankings.length} lists but ${weights.length} weights`);
  }
  if (weights.some((weight) => !Number.isFinite(weight) || weight < 0)) {
    throw new RangeError(`Weights must be numbers that are not negative, got ${weights}`);
  }

  const fused = new Map<string, ScoredChunk>();

  rankings.forEach((ranking, listIndex) => {
    const weight = weights[listIndex]!;
    ranking.forEach((chunk, index) => {
      const key = `${chunk.youtubeId}:${chunk.chunkIndex}`;
      const points = weight / (k + index + 1);
      const seen = fused.get(key);
      // The first copy supplies the text and times, and the score becomes the running total.
      fused.set(key, { ...(seen ?? chunk), score: (seen?.score ?? 0) + points });
    });
  });

  return [...fused.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}
