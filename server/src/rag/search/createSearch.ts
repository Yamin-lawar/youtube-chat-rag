import type { Embedder } from '../embeddings/embedder.js';
import type { Reranker } from '../rerank/types.js';
import type { QdrantChunkStore } from '../vectorstore/qdrantChunkStore.js';
import { DenseSearch } from './denseSearch.js';
import { HybridSearch } from './hybridSearch.js';
import { RerankedSearch } from './rerankedSearch.js';
import type { SearchStrategy, SearchStrategyName } from './types.js';

/**
 * Builds the search strategy with the given name, with a reranker on top when one is given.
 * The one place that knows every strategy.
 */
export function createSearch(
  name: SearchStrategyName,
  deps: {
    embedder: Embedder;
    store: QdrantChunkStore;
    sparseWeight?: number;
    reranker?: Reranker | undefined;
  },
): SearchStrategy {
  const search = createBaseSearch(name, deps);
  return deps.reranker ? new RerankedSearch(search, deps.reranker) : search;
}

function createBaseSearch(
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
