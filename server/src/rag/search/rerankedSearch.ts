import type { Reranker } from '../rerank/types.js';
import type { ScoredChunk } from '../vectorstore/qdrantChunkStore.js';
import type { SearchStrategy } from './types.js';

/**
 * How many chunks the search hands to the reranker. A reranker can only promote what it is
 * given, so a chunk the search ranked 15th can still reach the top, but one ranked 40th cannot.
 * More candidates means more reranking time.
 */
export const RERANK_CANDIDATES = 20;

/**
 * Wraps any search strategy with a reranker:
 *
 *   question --> search (fast, finds 20 candidates) --> reranker (slow, reads each one) --> best `limit`
 *
 * It is a SearchStrategy itself, so retrieval, the eval and the scripts use it like any other.
 */
export class RerankedSearch implements SearchStrategy {
  // Reranker scores are not cosine scores, so the margin of dense search does not apply.
  readonly maxScoreDrop = Number.POSITIVE_INFINITY;

  constructor(
    private readonly inner: SearchStrategy,
    private readonly reranker: Reranker,
    private readonly candidates = RERANK_CANDIDATES,
  ) {}

  /** The underlying search, so a run record says "dense" or "hybrid" and not "reranked". */
  get name(): SearchStrategy['name'] {
    return this.inner.name;
  }

  async search(question: string, youtubeIds: string[], limit: number): Promise<ScoredChunk[]> {
    const found = await this.inner.search(question, youtubeIds, Math.max(limit, this.candidates));
    const reranked = await this.reranker.rerank(question, found);
    return reranked.slice(0, limit);
  }
}
