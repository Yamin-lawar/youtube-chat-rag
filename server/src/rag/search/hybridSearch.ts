import type { Embedder } from '../embeddings/embedder.js';
import type { QdrantChunkStore, ScoredChunk } from '../vectorstore/qdrantChunkStore.js';
import { queryVector } from './bm25.js';
import { reciprocalRankFusion } from './rrf.js';
import type { SearchStrategy } from './types.js';

/**
 * How many chunks each search hands to the fusion, at least. A chunk that is 15th for meaning
 * but 1st for exact words should still be able to reach the top, so each list is longer than
 * the final result.
 */
const MIN_CANDIDATES = 20;

/**
 * Hybrid search: dense (meaning) plus sparse (exact words), merged into one ranking.
 *
 *   question --+--> dense search  (meaning)      --> ranked list A --+
 *              |                                                     +--> RRF --> one list
 *              +--> sparse search (exact words)  --> ranked list B --+
 *
 * The two searches are independent, so they run at the same time. The returned `score` is the
 * fused rank score (about 0.01 to 0.03), not a cosine similarity, so the margin that dense
 * search uses would keep everything. The margin is Infinity: retrieval keeps the top chunks
 * as they come. The eval's metrics at k = 1, 3, 5 and 10 do not depend on it.
 */
export class HybridSearch implements SearchStrategy {
  readonly name = 'hybrid' as const;
  readonly maxScoreDrop = Number.POSITIVE_INFINITY;

  constructor(
    private readonly embedder: Embedder,
    private readonly store: QdrantChunkStore,
  ) {}

  async search(question: string, youtubeIds: string[], limit: number): Promise<ScoredChunk[]> {
    const candidates = Math.max(limit, MIN_CANDIDATES);

    const [dense, sparse] = await Promise.all([
      this.embedder
        .embedQuery(question)
        .then((vector) => this.store.search(vector, youtubeIds, candidates)),
      this.store.searchSparse(queryVector(question), youtubeIds, candidates),
    ]);

    return reciprocalRankFusion([dense, sparse], limit);
  }
}
