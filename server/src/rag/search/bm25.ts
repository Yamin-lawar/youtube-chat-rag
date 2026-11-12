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

// Words that say nothing about the topic. BM25 already gives common words a low weight, but
// dropping them keeps the sparse vectors small and stops "what is the" from matching anything.
// The last two rows are spoken fillers and contractions as they look after apostrophes are removed.
const STOP_WORDS = new Set(
  `a about above after again all also am an and any are as at be because been before being below
  between both but by can could did do does doing down during each few for from further had has
  have having he her here hers him his how i if in into is it its just me more most my no nor not
  of off on once only or other our ours out over own same she should so some such than that the
  their theirs them then there these they this those through to too under until up very was we
  were what when where which while who whom why will with would you your yours
  um uh uhm yeah okay
  im ive youre weve theyre dont doesnt didnt isnt wasnt arent werent havent hasnt cant wont
  couldnt wouldnt shouldnt`.split(/\s+/),
);

/**
 * Splits text into the words BM25 matches on. Used for chunks and for questions, so both sides
 * are cut the same way. Repeats are kept, because how often a word appears is part of the score.
 *
 *   "CoreWeave's three customers made up 72% of revenue [music]"
 *     -> ["coreweave", "three", "customers", "made", "72", "revenue"]   ("up" and "of" are stop words)
 *
 * What it does, and why:
 * - Lower case, accents removed, so "Café" and "cafe" match.
 * - Caption sound tags such as [music] or [laughter] are dropped. They are not speech.
 * - Possessives are cut ("CoreWeave's" becomes "coreweave"), other apostrophes removed ("don't" -> "dont").
 * - Numbers survive: "72%" becomes "72", "1,000" becomes "1000", "2.4" stays "2.4". Exact figures
 *   are the kind of word a meaning-based search blurs and BM25 pins down.
 * - Hyphens and other punctuation split words ("fear-based" -> "fear", "based").
 * - Stop words are dropped.
 *
 * Not done on purpose: stemming ("costs" vs "cost"). It needs a stemming algorithm, so it is an
 * experiment for later, to be judged by the eval.
 */
export function tokenize(text: string): string[] {
  const cleaned = text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '') // the accents split off by NFKD
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/['’]s\b/g, '')
    .replace(/['’]/g, '')
    .replace(/(\d),(?=\d{3}\b)/g, '$1');

  // A word is letters and digits, with a decimal point allowed between digits ("2.4").
  const words = cleaned.match(/[\p{L}\p{N}]+(?:\.\p{N}+)?/gu) ?? [];
  return words.filter((word) => !STOP_WORDS.has(word));
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
