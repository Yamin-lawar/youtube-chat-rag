import { describe, expect, it } from 'vitest';
import { tokenize } from './bm25.js';

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

// Write these as you write documentVector() and queryVector(), one at a time.
describe('documentVector', () => {
  it.todo('gives a word that appears more often a larger value, with diminishing returns');
  it.todo('gives a word in a short chunk a larger value than the same word in a long chunk');
  it.todo('gives the same word the same index every time');
});

describe('queryVector', () => {
  it.todo('counts each distinct word of the question once');
});
