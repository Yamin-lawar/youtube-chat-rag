import type { Embedder } from '../embeddings/embedder.js';
import { DEFAULT_MAX_SCORE_DROP } from '../retrieval/retriever.js';
import type { QdrantChunkStore, ScoredChunk } from '../vectorstore/qdrantChunkStore.js';
import type { SearchStrategy } from './types.js';

/** Search by meaning: embed the question and find the nearest chunk vectors. This is the baseline. */
export class DenseSearch implements SearchStrategy {
  readonly name = 'dense' as const;
  readonly maxScoreDrop = DEFAULT_MAX_SCORE_DROP;

  constructor(
    private readonly embedder: Embedder,
    private readonly store: QdrantChunkStore,
  ) {}

  async search(question: string, youtubeIds: string[], limit: number): Promise<ScoredChunk[]> {
    const questionVector = await this.embedder.embedQuery(question);
    return this.store.search(questionVector, youtubeIds, limit);
  }
}
