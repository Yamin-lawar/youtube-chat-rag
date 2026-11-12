import type { ScoredChunk } from '../vectorstore/qdrantChunkStore.js';

/** The usual constant in the RRF formula. A larger value makes the ranks count more evenly. */
export const RRF_K = 60;

/**
 * Reciprocal Rank Fusion: merges several ranked lists of chunks into one.
 *
 * Each chunk earns 1 / (k + rank) from every list it appears in (rank starts at 1), and the
 * earned points are added up. A chunk near the top of both lists beats a chunk that is first in
 * one list and missing from the other. Only the rank is used, never the score, which is why it
 * can merge cosine scores and keyword scores that are not comparable.
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
  k: number = RRF_K,
): ScoredChunk[] {
  const fused = new Map<string, ScoredChunk>();

  for (const ranking of rankings) {
    ranking.forEach((chunk, index) => {
      const key = `${chunk.youtubeId}:${chunk.chunkIndex}`;
      const points = 1 / (k + index + 1);
      const seen = fused.get(key);
      // The first copy supplies the text and times, and the score becomes the running total.
      fused.set(key, { ...(seen ?? chunk), score: (seen?.score ?? 0) + points });
    });
  }

  return [...fused.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}
