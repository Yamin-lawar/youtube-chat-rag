import type { ScoredChunk } from '../vectorstore/qdrantChunkStore.js';

/** The ways of finding chunks for a question. Chosen with SEARCH_STRATEGY (or `--strategy` in the eval). */
export const SEARCH_STRATEGIES = ['dense', 'hybrid'] as const;
export type SearchStrategyName = (typeof SEARCH_STRATEGIES)[number];

/**
 * One way of turning a question into a ranked list of chunks.
 * Retrieval, the eval and the scripts only use this interface, so a new strategy is a new
 * class and nothing else changes.
 */
export interface SearchStrategy {
  readonly name: SearchStrategyName;

  /**
   * How far below the best score a chunk may fall before retrieval drops it. Scores from
   * different strategies are on different scales (cosine similarity is about 0.5 to 0.8, a
   * fused rank score is about 0.01 to 0.03), so each strategy sets its own margin.
   * Use Infinity to keep everything the search returns.
   */
  readonly maxScoreDrop: number;

  /** The best `limit` chunks of the given videos, best first. */
  search(question: string, youtubeIds: string[], limit: number): Promise<ScoredChunk[]>;
}
