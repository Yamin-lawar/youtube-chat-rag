import { describe, expect, it } from 'vitest';
import { NOT_FOUND_ANSWER } from '../rag/generation/chatModelGenerator.js';
import type { Source } from '../rag/generation/types.js';
import { citationPrecision, citedNumbers, citesEvidence, isRefusal } from './answerChecks.js';

describe('isRefusal', () => {
  it('recognises the fixed answer used when nothing was retrieved', () => {
    expect(isRefusal(NOT_FOUND_ANSWER)).toBe(true);
  });

  it('recognises the model saying it could not find the answer', () => {
    expect(isRefusal('I could not find that in the selected videos.')).toBe(true);
    expect(isRefusal("I couldn't find any mention of Tesla's price.")).toBe(true);
    expect(isRefusal('The excerpts do not mention nuclear fusion.')).toBe(true);
    expect(isRefusal('There is no mention of real estate in these videos.')).toBe(true);
  });

  it('does not treat a normal answer as a refusal', () => {
    expect(isRefusal('A neo cloud is a company that rents out GPUs [1].')).toBe(false);
  });

  it('ignores "does not mention" far into a long real answer', () => {
    const answer = `${'CoreWeave rents GPUs to AI labs and has grown fast. '.repeat(8)}The speaker does not mention the exact price.`;
    expect(isRefusal(answer)).toBe(false);
  });

  it('is not fooled by capital letters', () => {
    expect(isRefusal('I COULD NOT FIND this in the videos.')).toBe(true);
  });
});

describe('citedNumbers', () => {
  it('lists each cited excerpt once, in order of first use', () => {
    expect(citedNumbers('Yes [2][3]. Also [2] and [1].')).toEqual([2, 3, 1]);
  });

  it('returns nothing for an answer without citations', () => {
    expect(citedNumbers('No sources here.')).toEqual([]);
  });
});

describe('citesEvidence', () => {
  const source = (number: number, startMs: number, endMs: number): Source => ({
    number,
    youtubeId: 'vid',
    startMs,
    endMs,
    snippet: '',
  });
  const sources = [source(1, 0, 60_000), source(2, 60_000, 120_000)];
  const evidence = [[{ youtubeId: 'vid', startMs: 70_000, endMs: 80_000 }]];

  it('is true when a cited excerpt covers the evidence', () => {
    expect(citesEvidence('It is said here [2].', sources, evidence)).toBe(true);
  });

  it('is false when only other excerpts are cited', () => {
    expect(citesEvidence('It is said here [1].', sources, evidence)).toBe(false);
  });

  it('is false when the answer cites nothing, or an excerpt that does not exist', () => {
    expect(citesEvidence('No citation.', sources, evidence)).toBe(false);
    expect(citesEvidence('Odd citation [9].', sources, evidence)).toBe(false);
  });

  it('is true if any one of several pieces of evidence is covered', () => {
    const two = [[{ youtubeId: 'vid', startMs: 5_000, endMs: 6_000 }], ...evidence];
    expect(citesEvidence('Only [2].', sources, two)).toBe(true);
  });
});

describe('citationPrecision', () => {
  const source = (number: number, startMs: number, endMs: number): Source => ({
    number,
    youtubeId: 'vid',
    startMs,
    endMs,
    snippet: '',
  });
  const sources = [source(1, 0, 60_000), source(2, 60_000, 120_000), source(3, 120_000, 180_000)];
  const evidence = [[{ youtubeId: 'vid', startMs: 70_000, endMs: 80_000 }]];

  it('is the share of cited excerpts that hold the evidence', () => {
    expect(citationPrecision('Said [2], also [1] and [3].', sources, evidence)).toBeCloseTo(1 / 3);
    expect(citationPrecision('Said [2].', sources, evidence)).toBe(1);
    expect(citationPrecision('Said [1][3].', sources, evidence)).toBe(0);
  });

  it('counts a repeated citation once', () => {
    expect(citationPrecision('[2] and again [2], plus [1]', sources, evidence)).toBe(0.5);
  });

  it('is null when nothing real is cited', () => {
    expect(citationPrecision('No citation.', sources, evidence)).toBeNull();
    expect(citationPrecision('Odd [9].', sources, evidence)).toBeNull();
  });
});
