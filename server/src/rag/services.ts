import { QdrantClient } from '@qdrant/js-client-rest';
import { config } from '../config.js';
import { RecursiveChunker } from './chunking/recursiveChunker.js';
import type { Chunker } from './chunking/types.js';
import { EMBEDDING_DIMENSIONS, GeminiEmbedder, type Embedder } from './embeddings/embedder.js';
import { createGenerator, createRewriter } from './generation/providers.js';
import type { Generator } from './generation/types.js';
import type { QuestionRewriter } from './rewriting/types.js';
import { createSearch } from './search/createSearch.js';
import type { SearchStrategy } from './search/types.js';
import type { TranscriptProvider } from './transcript/types.js';
import { YoutubeTranscriptProvider } from './transcript/youtubeProvider.js';
import { QdrantChunkStore } from './vectorstore/qdrantChunkStore.js';

/** The RAG building blocks the server uses, created once and shared by all requests. */
export interface RagServices {
  transcriptProvider: TranscriptProvider;
  chunker: Chunker;
  embedder: Embedder;
  store: QdrantChunkStore;
  search: SearchStrategy;
  generator: Generator;
  rewriter: QuestionRewriter;
}

let services: RagServices | undefined;

/**
 * Built on first use, not at startup, so the server can still start (and serve the video
 * library) when an API key is missing. The error then appears when a feature needs the key.
 */
export function getRagServices(): RagServices {
  if (!services) {
    const keys = { googleApiKey: config.GOOGLE_API_KEY, groqApiKey: config.GROQ_API_KEY };
    const chunker = new RecursiveChunker();
    const embedder = new GeminiEmbedder(config.GOOGLE_API_KEY);
    // One collection per chunking strategy, so strategies can be compared later.
    const store = new QdrantChunkStore(
      new QdrantClient({ url: config.QDRANT_URL }),
      `chunks_${chunker.name}`,
      EMBEDDING_DIMENSIONS,
    );
    services = {
      transcriptProvider: new YoutubeTranscriptProvider(),
      chunker,
      embedder,
      store,
      search: createSearch(config.SEARCH_STRATEGY, {
        embedder,
        store,
        sparseWeight: config.HYBRID_SPARSE_WEIGHT,
      }),
      generator: createGenerator(keys),
      rewriter: createRewriter(keys),
    };
  }
  return services;
}
