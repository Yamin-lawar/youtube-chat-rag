import { describe, expect, it } from 'vitest';
import {
  BM25_K1,
  documentVector,
  queryVector,
  tokenize,
  wordIndex,
  type SparseVector,
} from './bm25.js';

describe('tokenize', () => {
  it('lower-cases and splits on spaces and punctuation', () => {
    expect(tokenize('Neo-cloud firms, CoreWeave!')).toEqual(['neo', 'cloud', 'firms', 'coreweave']);
  });

  it('keeps numbers in a form that can be matched', () => {
    expect(tokenize('72% of revenue')).toEqual(['72', 'revenue']);
    expect(tokenize('30-40% of jobs')).toEqual(['30', '40', 'jobs']);
    expect(tokenize('1,000 chips and 1,000,000 users')).toEqual([
      '1000',
      'chips',
      '1000000',
      'users',
    ]);
    expect(tokenize('2.4% growth')).toEqual(['2.4', 'growth']);
  });

  it('cuts possessives and removes other apostrophes', () => {
    expect(tokenize("CoreWeave's customers")).toEqual(['coreweave', 'customers']);
    expect(tokenize("O’Brien's debt")).toEqual(['obrien', 'debt']);
  });

  it('removes stop words and spoken fillers', () => {
    expect(tokenize('what is the share of revenue')).toEqual(['share', 'revenue']);
    expect(tokenize('um so yeah the chips')).toEqual(['chips']);
  });

  it('drops caption sound tags and speaker markers', () => {
    expect(tokenize('[music] the chips >> lose value [laughter]')).toEqual([
      'chips',
      'lose',
      'value',
    ]);
  });

  it('removes accents', () => {
    expect(tokenize('Café')).toEqual(['cafe']);
  });

  it('splits a web address at the dot but keeps both parts', () => {
    expect(tokenize('deeplearning.ai')).toEqual(['deeplearning', 'ai']);
  });

  it('keeps repeated words and their order, because frequency is part of the score', () => {
    expect(tokenize('cost price cost')).toEqual(['cost', 'price', 'cost']);
  });

  it('returns an empty list for empty text or only stop words', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('what is the')).toEqual([]);
  });
});

/** The value stored for a word in a vector, so tests do not depend on the order of the entries. */
const valueOf = (vector: SparseVector, word: string) =>
  vector.values[vector.indices.indexOf(wordIndex(word))];

/** What Qdrant does to score a chunk: multiply the values of words both vectors have, then add. */
function dot(a: SparseVector, b: SparseVector): number {
  return a.indices.reduce((sum, index, i) => {
    const at = b.indices.indexOf(index);
    return at === -1 ? sum : sum + a.values[i]! * b.values[at]!;
  }, 0);
}

describe('wordIndex', () => {
  it('gives the same number for the same word every time', () => {
    expect(wordIndex('coreweave')).toBe(wordIndex('coreweave'));
  });

  it('matches the published FNV-1a values, so it is the standard hash', () => {
    expect(wordIndex('')).toBe(0x811c9dc5);
    expect(wordIndex('a')).toBe(0xe40c292c);
  });

  it('gives different words different numbers', () => {
    expect(wordIndex('cost')).not.toBe(wordIndex('price'));
  });

  it('is always a whole number that fits in 32 bits without a sign', () => {
    for (const word of ['cost', 'coreweave', '72', 'deeplearning', 'zebra']) {
      const index = wordIndex(word);
      expect(Number.isInteger(index)).toBe(true);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(2 ** 32);
    }
  });
});

describe('documentVector', () => {
  it('weighs a word that appears once in an average-length chunk at exactly 1', () => {
    const vector = documentVector('alpha beta gamma delta', 4);
    expect(valueOf(vector, 'alpha')).toBeCloseTo(1);
  });

  it('gives a word that appears more often a larger value, with diminishing returns', () => {
    // Every chunk has 8 words, so only the number of times "cost" appears changes.
    const chunk = (count: number) => 'cost '.repeat(count) + 'filler '.repeat(8 - count);
    const [one, two, four] = [1, 2, 4].map((n) => valueOf(documentVector(chunk(n), 8), 'cost')!);

    expect(two).toBeGreaterThan(one!);
    expect(four).toBeGreaterThan(two!);
    expect(two).toBeLessThan(2 * one!); // twice the repeats is less than twice the weight
    expect(four).toBeLessThan(BM25_K1 + 1); // and it can never pass k1 + 1
  });

  it('gives a word in a short chunk a larger value than the same word in a long chunk', () => {
    const short = documentVector('cost filler filler filler', 20);
    const long = documentVector('cost ' + 'filler '.repeat(39), 20);
    expect(valueOf(short, 'cost')).toBeGreaterThan(valueOf(long, 'cost')!);
  });

  it('gives the same word the same index in every chunk', () => {
    const first = documentVector('cost alpha', 2);
    const second = documentVector('beta cost gamma', 3);
    expect(first.indices).toContain(wordIndex('cost'));
    expect(second.indices).toContain(wordIndex('cost'));
  });

  it('has one entry per distinct word', () => {
    const vector = documentVector('cost cost price', 3);
    expect(vector.indices).toHaveLength(2);
    expect(vector.values).toHaveLength(2);
  });

  it('is empty for empty text or only stop words', () => {
    expect(documentVector('', 10)).toEqual({ indices: [], values: [] });
    expect(documentVector('what is the', 10)).toEqual({ indices: [], values: [] });
  });

  it('refuses an average length that is not positive', () => {
    expect(() => documentVector('cost', 0)).toThrow(RangeError);
    expect(() => documentVector('cost', -5)).toThrow(RangeError);
    expect(() => documentVector('cost', Number.NaN)).toThrow(RangeError);
  });
});

describe('queryVector', () => {
  it('counts each distinct word of the question once', () => {
    const vector = queryVector('Cost cost PRICE the');
    expect(vector.indices).toEqual([wordIndex('cost'), wordIndex('price')]);
    expect(vector.values).toEqual([1, 1]);
  });

  it('is empty for an empty question', () => {
    expect(queryVector('')).toEqual({ indices: [], values: [] });
  });

  it('scores a chunk that has the question words above one that does not', () => {
    const question = queryVector('What does RPO mean?');
    const about = documentVector('rpo means rent customers have promised to pay', 8);
    const unrelated = documentVector('chips lose value as new models arrive', 8);

    expect(dot(question, about)).toBeGreaterThan(0);
    expect(dot(question, unrelated)).toBe(0);
  });
});
