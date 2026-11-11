import { describe, it } from 'vitest';

// Write these as you write bm25.ts, one at a time.
describe('tokenize', () => {
  it.todo('lower-cases and splits on spaces and punctuation');
  it.todo('keeps numbers such as "72%" in a form that can still be matched');
});

describe('documentVector', () => {
  it.todo('gives a word that appears more often a larger value, with diminishing returns');
  it.todo('gives a word in a short chunk a larger value than the same word in a long chunk');
  it.todo('gives the same word the same index every time');
});

describe('queryVector', () => {
  it.todo('counts each distinct word of the question once');
});
