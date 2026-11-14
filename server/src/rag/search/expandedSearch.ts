import type { Expansion } from '../expansion/types.js';
import type { ScoredChunk } from '../vectorstore/qdrantChunkStore.js';
import { reciprocalRankFusion } from './rrf.js';
import type { SearchStrategy } from './types.js';

/**
 * How many chunks each query hands to the fusion, at least. As in hybrid search, a chunk that
 * is 15th for one query but 1st for another should still be able to reach the top.
 */
const MIN_CANDIDATES = 20;

/**
 * Wraps any search strategy with query expansion:
 *
 *   question --> expander --> [question?, text 1, text 2, ...] --> search each --> RRF --> one list
 *
 * It is a SearchStrategy itself, so a reranker or the eval can sit on top of it like on any other.
 * When expansion fails, the user's own question is searched, so a model outage makes search a
 * little worse and never makes the chat fail.
 */
export class ExpandedSearch implements SearchStrategy {
  // With several lists the score is a fused rank score, not a cosine. Even a single list may
  // come from the model's text and not the question, so the cosine margin is not used.
  readonly maxScoreDrop = Number.POSITIVE_INFINITY;

  constructor(
    private readonly inner: SearchStrategy,
    private readonly expansion: Expansion,
  ) {}

  /** The underlying search, so a run record says "dense" or "hybrid" and not "expanded". */
  get name(): SearchStrategy['name'] {
    return this.inner.name;
  }

  async search(question: string, youtubeIds: string[], limit: number): Promise<ScoredChunk[]> {
    const queries = await this.queriesFor(question);
    const candidates = Math.max(limit, MIN_CANDIDATES);

    // One after the other, not at the same time: each search embeds its text, and the embedder
    // throttles itself and writes the question cache to one file.
    const lists: ScoredChunk[][] = [];
    for (const query of queries) {
      lists.push(await this.inner.search(query, youtubeIds, candidates));
    }

    return reciprocalRankFusion(lists, limit);
  }

  private async queriesFor(question: string): Promise<string[]> {
    let texts: string[] = [];
    try {
      texts = await this.expansion.expander.expand(question);
    } catch (error) {
      console.warn(
        `Query expansion failed, searching with the question only: ${
          error instanceof Error ? error.message.split('\n')[0] : String(error)
        }`,
      );
    }

    const queries =
      this.expansion.keepOriginal || texts.length === 0 ? [question, ...texts] : texts;
    return [...new Set(queries)];
  }
}
