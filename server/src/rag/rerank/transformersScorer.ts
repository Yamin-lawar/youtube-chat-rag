import type { PairScorer } from './types.js';

// Chunks are about 1000 characters (roughly 250 tokens), well under this. It only guards against
// an unusually long chunk making one batch very slow.
const MAX_TOKENS = 512;
// Scoring pairs in small batches keeps memory low. The answer does not depend on the batch size.
const BATCH_SIZE = 16;

// The model files are downloaded once and kept here, outside the repo.
const CACHE_DIR = new URL('../../../.model-cache/', import.meta.url).pathname;

type Transformers = typeof import('@huggingface/transformers');
type Tokenizer = Awaited<ReturnType<Transformers['AutoTokenizer']['from_pretrained']>>;
type Model = Awaited<
  ReturnType<Transformers['AutoModelForSequenceClassification']['from_pretrained']>
>;

/**
 * A scorer that runs a cross-encoder inside this Node process (ONNX, on the CPU), so it needs no
 * API key, has no rate limit and gives the same scores every time. The library and the model are
 * loaded on the first call, not at startup, so a server that does not use a reranker never pays
 * for them.
 *
 * The model's raw output (a "logit") is the score. It is only meaningful for ordering chunks
 * against the same question: do not compare it with a cosine similarity or across questions.
 */
export function transformersScorer(modelId: string, dtype: 'fp32' | 'q8'): PairScorer {
  let loading: Promise<{ tokenizer: Tokenizer; model: Model }> | undefined;

  // Loaded once and shared. If the download fails the next call tries again.
  const load = () =>
    (loading ??= (async () => {
      const lib = await import('@huggingface/transformers');
      lib.env.cacheDir = CACHE_DIR;
      const [tokenizer, model] = await Promise.all([
        lib.AutoTokenizer.from_pretrained(modelId),
        lib.AutoModelForSequenceClassification.from_pretrained(modelId, { dtype }),
      ]);
      return { tokenizer, model };
    })().catch((error: unknown) => {
      loading = undefined;
      throw error;
    }));

  return async (question, texts) => {
    const { tokenizer, model } = await load();
    const scores: number[] = [];

    for (let start = 0; start < texts.length; start += BATCH_SIZE) {
      const batch = texts.slice(start, start + BATCH_SIZE);
      const inputs = tokenizer(new Array<string>(batch.length).fill(question), {
        text_pair: batch,
        padding: true,
        truncation: true,
        max_length: MAX_TOKENS,
      });
      const { logits } = (await model(inputs)) as { logits: { data: Float32Array } };
      scores.push(...Array.from(logits.data));
    }
    return scores;
  };
}
