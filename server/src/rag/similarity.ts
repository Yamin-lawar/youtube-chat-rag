/**
 * Cosine similarity: how closely two vectors point in the same direction.
 * 1 means identical direction (same meaning), 0 means unrelated, -1 means opposite.
 * It ignores vector length, so only the direction (the meaning) is compared.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vectors must have the same length (got ${a.length} and ${b.length})`);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dotProduct += x * y;
    normA += x * x;
    normB += y * y;
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
