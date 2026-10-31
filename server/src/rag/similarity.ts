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

/** Length of a vector (its distance from the origin). Normalized vectors have length 1. */
export function vectorLength(vector: number[]): number {
  let sum = 0;
  for (const value of vector) sum += value * value;
  return Math.sqrt(sum);
}

/**
 * Dot product: multiply matching numbers and add them up.
 * Higher means more similar, but unlike cosine it grows with vector length.
 */
export function dotProduct(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vectors must have the same length (got ${a.length} and ${b.length})`);
  }

  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i]! * b[i]!;
  return sum;
}

/**
 * Euclidean distance: the straight-line distance between two points.
 * Lower means more similar (0 means identical), the opposite of cosine and dot product.
 */
export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vectors must have the same length (got ${a.length} and ${b.length})`);
  }

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const difference = a[i]! - b[i]!;
    sum += difference * difference;
  }
  return Math.sqrt(sum);
}
