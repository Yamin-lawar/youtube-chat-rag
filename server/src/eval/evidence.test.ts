import { describe, expect, it } from 'vitest';
import type { ChunkPayload } from '../rag/vectorstore/qdrantChunkStore.js';
import { chunkCoversSpan, findEvidenceSpans } from './evidence.js';

const ID = 'abc123DEF45';

function chunk(chunkIndex: number, text: string, startMs: number, endMs: number): ChunkPayload {
  return { youtubeId: ID, chunkIndex, text, startMs, endMs };
}

// 100 characters over 100 seconds, so the position of a quote in the text is its time in seconds.
const filler = (n: number) => 'x'.repeat(n);
const text = `${filler(40)}THE ANSWER IS HERE${filler(42)}`;

describe('findEvidenceSpans', () => {
  it('places the quote in time by its position in the chunk', () => {
    const [span] = findEvidenceSpans([chunk(0, text, 0, 100_000)], {
      youtubeId: ID,
      quote: 'the answer is here',
    });
    // The quote sits at 40s-58s, widened by the 8s padding.
    expect(span?.startMs).toBeCloseTo(32_000, -2);
    expect(span?.endMs).toBeCloseTo(66_000, -2);
  });

  it('ignores case and line breaks in the quote', () => {
    const spans = findEvidenceSpans([chunk(0, 'one two\nthree four five six', 0, 60_000)], {
      youtubeId: ID,
      quote: 'Two Three Four',
    });
    expect(spans).toHaveLength(1);
  });

  it('merges the copies found in two overlapping chunks into one span', () => {
    const spans = findEvidenceSpans(
      [
        chunk(0, `${filler(80)}THE ANSWER IS HERE`, 0, 100_000),
        chunk(1, `THE ANSWER IS HERE${filler(80)}`, 79_000, 179_000),
      ],
      { youtubeId: ID, quote: 'the answer is here' },
    );
    expect(spans).toHaveLength(1);
  });

  it('keeps separate spans when the quote is said in two different places', () => {
    const spans = findEvidenceSpans(
      [chunk(0, text, 0, 100_000), chunk(1, text, 500_000, 600_000)],
      { youtubeId: ID, quote: 'the answer is here' },
    );
    expect(spans).toHaveLength(2);
  });

  it('returns nothing when the quote is not in the video', () => {
    expect(
      findEvidenceSpans([chunk(0, text, 0, 100_000)], {
        youtubeId: ID,
        quote: 'not said anywhere',
      }),
    ).toEqual([]);
  });

  it("only looks at chunks of the quote's own video", () => {
    expect(
      findEvidenceSpans([chunk(0, text, 0, 100_000)], {
        youtubeId: 'otherVideo1',
        quote: 'the answer is here',
      }),
    ).toEqual([]);
  });
});

describe('chunkCoversSpan', () => {
  const span = { youtubeId: ID, startMs: 40_000, endMs: 60_000 };

  it('is true when the chunk overlaps the span at all', () => {
    expect(chunkCoversSpan({ youtubeId: ID, startMs: 55_000, endMs: 120_000 }, span)).toBe(true);
  });

  it('is false for a chunk before or after the span', () => {
    expect(chunkCoversSpan({ youtubeId: ID, startMs: 0, endMs: 39_000 }, span)).toBe(false);
    expect(chunkCoversSpan({ youtubeId: ID, startMs: 61_000, endMs: 90_000 }, span)).toBe(false);
  });

  it('is false for another video, even at the same time', () => {
    expect(
      chunkCoversSpan({ youtubeId: 'otherVideo1', startMs: 40_000, endMs: 60_000 }, span),
    ).toBe(false);
  });
});
