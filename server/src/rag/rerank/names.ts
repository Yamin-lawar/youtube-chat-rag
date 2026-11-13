/**
 * The rerankers that can be chosen with RERANKER (or `--reranker` in the eval). Each is an open
 * model that runs locally. This file has no heavy imports, so config can read it at startup.
 * Measured on an Apple-silicon laptop, reranking 20 chunks takes:
 *   minilm  about 0.25 s  (about 90 MB download, English only)
 *   bge-m3  about 4 s     (about 570 MB download, 100+ languages)
 */
export const RERANKER_MODELS = {
  minilm: { id: 'Xenova/ms-marco-MiniLM-L-6-v2', dtype: 'fp32' },
  'bge-m3': { id: 'onnx-community/bge-reranker-v2-m3-ONNX', dtype: 'q8' },
} as const;

export const RERANKER_NAMES = ['none', 'minilm', 'bge-m3'] as const;
export type RerankerName = (typeof RERANKER_NAMES)[number];
