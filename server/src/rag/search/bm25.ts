/**
 * A sparse vector, the way Qdrant stores one: only the non-zero entries. `indices[i]` is a word
 * (as a number) and `values[i]` is how much that word counts in this text.
 */
export interface SparseVector {
  indices: number[];
  values: number[];
}

/** The usual BM25 settings. k1 caps how much repeating a word helps, b is the length correction. */
export const BM25_K1 = 1.2;
export const BM25_B = 0.75;

/**
 * Splits text into words to match on: lower case, punctuation removed.
 * Auto-generated captions have no punctuation to speak of, so this is mostly a split on spaces.
 * Decide about stop words ("the", "of") and stemming ("costs" and "cost") and measure the effect.
 *
 * TODO(you): write this, then the tests in bm25.test.ts.
 */
export function tokenize(_text: string): string[] {
  throw new Error('tokenize is not written yet.');
}

/**
 * Turns a chunk's text into the sparse vector that is stored with it.
 *
 * Each word gets a weight that grows with how often it appears in the chunk, but flattens out
 * (BM25_K1) and is corrected for chunk length (BM25_B, `averageLength`). The rarity of a word
 * across all chunks (IDF) is NOT applied here: Qdrant does that when the sparse vector is
 * configured with the `idf` modifier, so the client only sends the within-chunk part.
 *
 * Words must become numbers for Qdrant. Use a stable hash of the word, so the same word always
 * gets the same number without keeping a vocabulary file.
 *
 * TODO(you): write this.
 */
export function documentVector(_text: string, _averageLength: number): SparseVector {
  throw new Error('documentVector is not written yet.');
}

/**
 * Turns a question into a sparse vector: every distinct word counts 1.
 *
 * TODO(you): write this.
 */
export function queryVector(_question: string): SparseVector {
  throw new Error('queryVector is not written yet.');
}
