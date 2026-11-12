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
 * The typical number of words in a chunk after tokenizing. It is a constant, not measured from
 * whatever is being ingested, so a chunk's vector never depends on which other videos exist.
 * The stored chunks (about 1000 characters each) average 85 to 90 words, with a few videos
 * higher, so 90 is close for almost all of them.
 */
export const AVERAGE_CHUNK_WORDS = 90;

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
 * Turns a word into the number Qdrant needs as its position in a sparse vector (a 32-bit
 * unsigned integer). It is a hash of the word, so the same word always gets the same number
 * without keeping a vocabulary file, and chunks stored today still match questions asked later.
 *
 * The hash is FNV-1a: a few lines, no dependency, and spread out well enough for this. Two
 * different words can in theory get the same number. With the few thousand distinct words in
 * a handful of videos that is very unlikely, and the effect would be one word counting slightly
 * for another.
 */
export function wordIndex(word: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < word.length; i++) {
    hash ^= word.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Turns a chunk's text into the sparse vector that is stored with it.
 *
 * Each word gets this BM25 weight:
 *
 *                 tf * (k1 + 1)
 *   weight = ---------------------------------------
 *             tf + k1 * (1 - b + b * length / average)
 *
 * - `tf` is how many times the word appears in the chunk. More is better, but the weight levels
 *   off below k1 + 1 (2.2), so saying "debt" ten times is not ten times better than twice.
 * - `length` is the number of words in the chunk and `averageLength` the typical number across
 *   chunks. A chunk longer than average is penalised and a shorter one helped, because a long
 *   chunk contains many words by chance. `b` sets how strong that correction is.
 *   A word that appears once in an average-length chunk weighs exactly 1.
 *
 * The rarity of a word across all chunks (IDF) is NOT applied here: Qdrant does that when the
 * sparse vector is configured with the `idf` modifier, so the client only sends this part.
 */
export function documentVector(text: string, averageLength: number): SparseVector {
  if (!(averageLength > 0)) {
    throw new RangeError(`averageLength must be greater than 0, got ${averageLength}`);
  }

  const words = tokenize(text);
  const counts = new Map<string, number>();
  for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);

  const lengthFactor = 1 - BM25_B + (BM25_B * words.length) / averageLength;
  const vector: SparseVector = { indices: [], values: [] };
  for (const [word, tf] of counts) {
    vector.indices.push(wordIndex(word));
    vector.values.push((tf * (BM25_K1 + 1)) / (tf + BM25_K1 * lengthFactor));
  }
  return vector;
}

/**
 * Turns a question into a sparse vector: every distinct word counts 1. Repeating a word in the
 * question does not make it matter more. Qdrant multiplies each matching word's weight in a chunk
 * by this 1 (and by the word's IDF), then adds them up to score the chunk.
 */
export function queryVector(question: string): SparseVector {
  const distinct = [...new Set(tokenize(question))];
  return { indices: distinct.map(wordIndex), values: distinct.map(() => 1) };
}
