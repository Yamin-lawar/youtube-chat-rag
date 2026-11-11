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
 * Chunks are the same when `youtubeId` and `chunkIndex` match. The returned `score` is the
 * summed points, and the list is sorted best first and cut to `limit`.
 *
 * TODO(you): write this, then the tests in rrf.test.ts.
 */
export function reciprocalRankFusion(
  _rankings: ScoredChunk[][],
  _limit: number,
  _k: number = RRF_K,
): ScoredChunk[] {
  throw new Error('reciprocalRankFusion is not written yet.');
}
