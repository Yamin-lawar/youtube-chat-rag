import type { Embedder } from '../embeddings/embedder.js';
import type { QdrantChunkStore, ScoredChunk } from '../vectorstore/qdrantChunkStore.js';
import type { SearchStrategy } from './types.js';

/**
 * Hybrid search: dense (meaning) plus sparse (exact words), merged into one ranking.
 *
 * EXPERIMENT 1, YOUR TURN. The pieces to write, each in its own small file:
 *
 *   1. bm25.ts   tokenize(text) and the BM25 weights, to turn text into a sparse vector
 *   2. rrf.ts    reciprocalRankFusion(), to merge two ranked lists into one
 *   3. this file call both: dense list + sparse list -> fused list
 *   4. the store: save a sparse vector next to each chunk's dense vector, and search it
 *
 *   question --+--> dense search  (meaning)      --> ranked list A --+
 *              |                                                     +--> RRF --> one list
 *              +--> sparse search (exact words)  --> ranked list B --+
 *
 * Scores after RRF are about 0.01 to 0.03, not cosine similarity, so the 0.12 margin that
 * dense search uses would keep everything. The margin is Infinity for now; decide what the
 * model should receive once you see the numbers in the eval.
 */
export class HybridSearch implements SearchStrategy {
  readonly name = 'hybrid' as const;
  readonly maxScoreDrop = Number.POSITIVE_INFINITY;

  constructor(
    protected readonly embedder: Embedder,
    protected readonly store: QdrantChunkStore,
  ) {}

  search(_question: string, _youtubeIds: string[], _limit: number): Promise<ScoredChunk[]> {
    return Promise.reject(
      new Error(
        'Hybrid search is not written yet. See the steps in src/rag/search/hybridSearch.ts.',
      ),
    );
  }
}
