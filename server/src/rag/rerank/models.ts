import { CrossEncoderReranker } from './crossEncoderReranker.js';
import { RERANKER_MODELS, type RerankerName } from './names.js';
import { transformersScorer } from './transformersScorer.js';
import type { Reranker } from './types.js';

/** Builds the reranker with the given name, or undefined for "none" (no reranking). */
export function createReranker(name: RerankerName): Reranker | undefined {
  if (name === 'none') return undefined;
  const { id, dtype } = RERANKER_MODELS[name];
  return new CrossEncoderReranker(name, transformersScorer(id, dtype));
}
