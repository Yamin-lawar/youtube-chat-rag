import type { Embedder } from '../embeddings/embedder.js';
import type { QdrantChunkStore } from '../vectorstore/qdrantChunkStore.js';
import { DenseSearch } from './denseSearch.js';
import { HybridSearch } from './hybridSearch.js';
import type { SearchStrategy, SearchStrategyName } from './types.js';

/** Builds the search strategy with the given name. The one place that knows every strategy. */
export function createSearch(
  name: SearchStrategyName,
  deps: { embedder: Embedder; store: QdrantChunkStore; sparseWeight?: number },
): SearchStrategy {
  switch (name) {
    case 'dense':
      return new DenseSearch(deps.embedder, deps.store);
    case 'hybrid':
      return new HybridSearch(deps.embedder, deps.store, deps.sparseWeight);
  }
}
