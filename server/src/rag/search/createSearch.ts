import type { Embedder } from '../embeddings/embedder.js';
import type { Expansion } from '../expansion/types.js';
import type { Reranker } from '../rerank/types.js';
import type { QdrantChunkStore } from '../vectorstore/qdrantChunkStore.js';
import { DenseSearch } from './denseSearch.js';
import { ExpandedSearch } from './expandedSearch.js';
import { HybridSearch } from './hybridSearch.js';
import { RerankedSearch } from './rerankedSearch.js';
import type { SearchStrategy, SearchStrategyName } from './types.js';

/**
 * Builds the search strategy with the given name. Query expansion wraps it when given, and a
 * reranker goes on top of that. The reranker reads the user's own question, not the expansions.
 * The one place that knows every strategy.
 */
export function createSearch(
  name: SearchStrategyName,
  deps: {
    embedder: Embedder;
    store: QdrantChunkStore;
    sparseWeight?: number;
    expansion?: Expansion | undefined;
    reranker?: Reranker | undefined;
  },
): SearchStrategy {
  const base = createBaseSearch(name, deps);
  const search = deps.expansion ? new ExpandedSearch(base, deps.expansion) : base;
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
