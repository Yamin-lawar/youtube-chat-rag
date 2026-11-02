import { describe, expect, it } from 'vitest';
import { chunkPointId } from './qdrantChunkStore.js';

describe('chunkPointId', () => {
  it('is the same every time for the same video and chunk', () => {
    expect(chunkPointId('abc123DEF45', 3)).toBe(chunkPointId('abc123DEF45', 3));
  });

  it('differs between chunks of a video and between videos', () => {
    expect(chunkPointId('abc123DEF45', 3)).not.toBe(chunkPointId('abc123DEF45', 4));
    expect(chunkPointId('abc123DEF45', 3)).not.toBe(chunkPointId('zzz123DEF45', 3));
  });

  it('is a valid UUID, which is what Qdrant requires', () => {
    expect(chunkPointId('abc123DEF45', 0)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});
