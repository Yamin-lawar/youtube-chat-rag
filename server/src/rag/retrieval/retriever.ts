import type { Embedder } from '../embeddings/embedder.js';
import type { QdrantChunkStore, ScoredChunk } from '../vectorstore/qdrantChunkStore.js';

// How many candidates to ask Qdrant for before the cutoff removes weak ones.
const DEFAULT_TOP_K = 8;

// Cosine scores are relative: in our tests a good match scored about 0.83 and an unrelated
// question's best match about 0.52, while chunks of one video score 0.85+ against each other.
// So a fixed threshold does not work. Instead we keep chunks close to the best score.
const DEFAULT_MAX_SCORE_DROP = 0.08;

export interface RetrieveOptions {
  youtubeIds: string[];
  topK?: number;
  maxScoreDrop?: number;
}

/**
 * Keeps the chunks scoring within `maxScoreDrop` of the best one.
 * Expects the chunks sorted best first, as Qdrant returns them.
 */
export function keepNearBest(chunks: ScoredChunk[], maxScoreDrop: number): ScoredChunk[] {
  const best = chunks[0];
  if (!best) return [];
  return chunks.filter((chunk) => best.score - chunk.score <= maxScoreDrop);
}

/** The retrieval step: question -> embedding -> nearest chunks of the chosen videos. */
export async function retrieveChunks(
  question: string,
  { embedder, store }: { embedder: Embedder; store: QdrantChunkStore },
  { youtubeIds, topK = DEFAULT_TOP_K, maxScoreDrop = DEFAULT_MAX_SCORE_DROP }: RetrieveOptions,
): Promise<ScoredChunk[]> {
  const questionVector = await embedder.embedQuery(question);
  const candidates = await store.search(questionVector, youtubeIds, topK);
  return keepNearBest(candidates, maxScoreDrop);
}
