import type { ScoredChunk } from '../vectorstore/qdrantChunkStore.js';
import type { PairScorer, Reranker } from './types.js';

/**
 * A reranker built on a cross-encoder: a model that reads the question and a chunk together and
 * outputs one relevance score. The scoring itself is passed in (see transformersScorer.ts), so the
 * ordering logic here can be tested without loading a model.
 */
export class CrossEncoderReranker implements Reranker {
  constructor(
    readonly name: string,
    private readonly score: PairScorer,
  ) {}

  async rerank(question: string, chunks: ScoredChunk[]): Promise<ScoredChunk[]> {
    if (chunks.length === 0) return [];

    const scores = await this.score(
      question,
      chunks.map((chunk) => chunk.text),
    );
    if (scores.length !== chunks.length) {
      throw new Error(`Got ${scores.length} scores for ${chunks.length} chunks`);
    }

    // Array.sort is stable, so chunks with equal scores keep the order the search gave them.
    return chunks
      .map((chunk, i) => ({ ...chunk, score: scores[i]! }))
      .sort((a, b) => b.score - a.score);
  }
}
