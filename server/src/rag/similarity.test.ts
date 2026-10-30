import { describe, expect, it } from 'vitest';
import { cosineSimilarity } from './similarity.js';

describe('cosineSimilarity', () => {
  it('is 1 for vectors pointing the same way, whatever their length', () => {
    expect(cosineSimilarity([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
  });

  it('is 0 for perpendicular vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it('is -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 1], [-1, -1])).toBeCloseTo(-1);
  });

  it('is 0 when a vector is all zeros', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });

  it('rejects vectors of different lengths', () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow();
  });
});
