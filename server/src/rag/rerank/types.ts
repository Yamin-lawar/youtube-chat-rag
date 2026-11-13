import type { ScoredChunk } from '../vectorstore/qdrantChunkStore.js';

/**
 * Re-orders chunks that a search already found, using a model that reads the question and each
 * chunk together. Search compares two precomputed vectors, which is fast but coarse. A reranker
 * looks at the actual words of both, which is slower, so it only sees the few best candidates.
 */
export interface Reranker {
  /** Names the model, so a run record says what was used. */
  readonly name: string;

  /** The chunks sorted best first, with `score` set to the reranker's own score. */
  rerank(question: string, chunks: ScoredChunk[]): Promise<ScoredChunk[]>;
}

/** Scores how well each text answers the question. Higher is better. One score per text, same order. */
export type PairScorer = (question: string, texts: string[]) => Promise<number[]>;
