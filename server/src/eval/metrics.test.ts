import { describe, expect, it } from 'vitest';
import { evidenceRecall, mean, randomHitAtK, scoreQuestion, type RankedChunk } from './metrics.js';
import type { TimeSpan } from './types.js';

const ID = 'abc123DEF45';
const chunkAt = (startS: number): RankedChunk => ({
  youtubeId: ID,
  startMs: startS * 1000,
  endMs: (startS + 60) * 1000,
});
const passageAt = (startS: number): TimeSpan[] => [
  { youtubeId: ID, startMs: startS * 1000, endMs: (startS + 10) * 1000 },
];

describe('scoreQuestion', () => {
  it('gives full marks when the correct chunk is ranked first', () => {
    const score = scoreQuestion([chunkAt(0), chunkAt(300)], [passageAt(20)], 1);
    expect(score.firstRank).toBe(1);
    expect(score.reciprocalRank).toBe(1);
    expect(score.hitAt[1]).toBe(1);
    expect(score.recallAt[1]).toBe(1);
  });

  it('uses 1/rank for the reciprocal rank', () => {
    const score = scoreQuestion([chunkAt(300), chunkAt(600), chunkAt(0)], [passageAt(20)], 1);
    expect(score.firstRank).toBe(3);
    expect(score.reciprocalRank).toBeCloseTo(1 / 3);
    expect(score.hitAt[1]).toBe(0);
    expect(score.hitAt[3]).toBe(1);
  });

  it('scores zero when no returned chunk covers the answer', () => {
    const score = scoreQuestion([chunkAt(300), chunkAt(600)], [passageAt(20)], 1);
    expect(score.firstRank).toBeNull();
    expect(score.reciprocalRank).toBe(0);
    expect(score.hitAt[10]).toBe(0);
    expect(score.recallAt[10]).toBe(0);
  });

  it('counts the share of passages found for recall', () => {
    // Two passages, only the first is covered within the top 1; both within the top 3.
    const ranked = [chunkAt(0), chunkAt(300), chunkAt(600)];
    const score = scoreQuestion(ranked, [passageAt(20), passageAt(620)], 2);
    expect(score.recallAt[1]).toBe(0.5);
    expect(score.recallAt[3]).toBe(1);
    expect(score.hitAt[1]).toBe(1);
  });

  it('accepts a passage that is covered by either of two overlapping spans', () => {
    const passage = [...passageAt(20), ...passageAt(700)];
    expect(scoreQuestion([chunkAt(650)], [passage], 1).firstRank).toBe(1);
  });
});

describe('precision and nDCG', () => {
  // Rank 1 and rank 3 are correct, rank 2 is not. Two chunks in the pool are correct.
  const ranked = [chunkAt(0), chunkAt(300), chunkAt(600)];
  const evidence = [passageAt(20), passageAt(620)];
  const score = scoreQuestion(ranked, evidence, 2);

  it('precision is the share of the top k that is correct', () => {
    expect(score.precisionAt[1]).toBe(1);
    expect(score.precisionAt[3]).toBeCloseTo(2 / 3);
  });

  it('precision counts missing slots as wrong', () => {
    // Only 3 chunks came back, so the top 5 has 2 correct out of 5.
    expect(score.precisionAt[5]).toBeCloseTo(2 / 5);
  });

  it('the best possible precision is capped by how many chunks are correct', () => {
    expect(score.bestPrecisionAt[1]).toBe(1);
    expect(score.bestPrecisionAt[5]).toBeCloseTo(2 / 5);
  });

  it('nDCG is 1 for a perfect order and lower when a correct chunk is pushed down', () => {
    const perfect = scoreQuestion([chunkAt(0), chunkAt(600), chunkAt(300)], evidence, 2);
    expect(perfect.ndcgAt[3]).toBeCloseTo(1);
    // DCG = 1 + 0 + 1/log2(4) = 1.5, ideal = 1 + 1/log2(3) = 1.6309
    expect(score.ndcgAt[3]).toBeCloseTo(1.5 / (1 + 1 / Math.log2(3)));
  });

  it('nDCG is 0 when nothing correct is returned', () => {
    expect(scoreQuestion([chunkAt(300)], evidence, 2).ndcgAt[3]).toBe(0);
  });
});

describe('evidenceRecall', () => {
  it('counts the passages covered by any of the chunks, however many chunks there are', () => {
    const chunks = [chunkAt(0), chunkAt(300), chunkAt(900)];
    expect(evidenceRecall(chunks, [passageAt(20), passageAt(320), passageAt(2000)])).toBeCloseTo(
      2 / 3,
    );
  });

  it('is 0 for no chunks or no passages', () => {
    expect(evidenceRecall([], [passageAt(20)])).toBe(0);
    expect(evidenceRecall([chunkAt(0)], [])).toBe(0);
  });
});

describe('randomHitAtK', () => {
  it('is the share of the pool for a single pick', () => {
    expect(randomHitAtK(10, 2, 1)).toBeCloseTo(0.2);
  });

  it('grows with k', () => {
    expect(randomHitAtK(10, 1, 5)).toBeCloseTo(0.5);
  });

  it('is 1 when k covers the whole pool', () => {
    expect(randomHitAtK(12, 1, 12)).toBe(1);
  });

  it('is 0 when nothing is relevant', () => {
    expect(randomHitAtK(12, 0, 3)).toBe(0);
  });
});

describe('mean', () => {
  it('averages, and is 0 for no values', () => {
    expect(mean([1, 0, 0.5])).toBe(0.5);
    expect(mean([])).toBe(0);
  });
});
