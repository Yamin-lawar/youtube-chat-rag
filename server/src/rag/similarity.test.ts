import { describe, expect, it } from 'vitest';
import { cosineSimilarity, dotProduct, euclideanDistance, vectorLength } from './similarity.js';

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

describe('dotProduct', () => {
  it('multiplies matching numbers and adds them', () => {
    expect(dotProduct([1, 2], [2, 4])).toBe(10);
  });

  it('grows with vector length even when the direction is the same', () => {
    expect(dotProduct([1, 0], [3, 0])).toBeGreaterThan(dotProduct([1, 0], [1, 0]));
  });
});

describe('euclideanDistance', () => {
  it('is 0 for identical vectors', () => {
    expect(euclideanDistance([1, 2], [1, 2])).toBe(0);
  });

  it('measures straight-line distance', () => {
    expect(euclideanDistance([0, 0], [3, 4])).toBe(5);
  });
});

describe('vectorLength', () => {
  it('is the straight-line length of the vector', () => {
    expect(vectorLength([3, 4])).toBe(5);
  });
});
