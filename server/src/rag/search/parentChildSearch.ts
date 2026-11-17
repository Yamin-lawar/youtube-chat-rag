import type { ScoredChunk } from '../vectorstore/qdrantChunkStore.js';
import type { ParentResolver } from './parentResolver.js';
import type { SearchStrategy } from './types.js';

/**
 * How many small chunks to look at for each parent wanted. Several small chunks of one passage
 * usually match together and collapse into one parent, so asking for exactly `limit` small
 * chunks would often leave fewer than `limit` parents.
 */
const CHILDREN_PER_PARENT = 4;

/**
 * Parent-child retrieval: find with small chunks, hand over the bigger text around them.
 *
 *   question --> search small chunks --> each one's parent --> drop repeats --> bigger chunks
 *
 * A small chunk is about one idea, so its vector matches a question precisely. A big chunk has
 * the context the answer model needs ("it" and "that" make sense again), but its vector blurs
 * several ideas. This takes the precision of the first and the context of the second.
 *
 * It is a SearchStrategy itself, so expansion, a reranker or the eval can sit on top of it.
 */
export class ParentChildSearch implements SearchStrategy {
  // The score is the best small chunk's score, still a cosine for a dense search, so the
  // margin of the search underneath stays right.
  readonly maxScoreDrop: number;

  constructor(
    private readonly inner: SearchStrategy,
    private readonly parentOf: ParentResolver,
  ) {
    this.maxScoreDrop = inner.maxScoreDrop;
  }

  get name(): SearchStrategy['name'] {
    return this.inner.name;
  }

  async search(question: string, youtubeIds: string[], limit: number): Promise<ScoredChunk[]> {
    const children = await this.inner.search(question, youtubeIds, limit * CHILDREN_PER_PARENT);

    // Children come best first, so the first child to reach a parent is its best child.
    const parents = new Map<string, ScoredChunk>();
    for (const child of children) {
      const parent = this.parentOf(child);
      if (!parent) {
        // The bigger chunking does not cover this video. Hiding that would quietly search a
        // different set of videos, so stop and say which one.
        throw new Error(
          `No parent chunk for ${child.youtubeId} at ${child.startMs} ms. ` +
            'Ingest the parent chunking for this video first.',
        );
      }
      const key = `${parent.youtubeId}:${parent.chunkIndex}`;
      if (!parents.has(key)) parents.set(key, { ...parent, score: child.score });
      if (parents.size === limit) break;
    }
    return [...parents.values()];
  }
}
