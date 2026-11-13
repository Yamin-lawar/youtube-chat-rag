import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { TaskType } from '@google/generative-ai';

export const EMBEDDING_MODEL = 'gemini-embedding-001';
// The model supports 768, 1536 or 3072. Smaller vectors cost less to store and search,
// and 768 keeps almost all of the quality for this kind of data.
export const EMBEDDING_DIMENSIONS = 768;

const BATCH_SIZE = 20;

// The Gemini free tier allows 100 embedding requests per minute, and every text in a
// batch counts as one request. We stay a little under that to leave room for queries.
const MAX_TEXTS_PER_MINUTE = 90;
const WINDOW_MS = 60_000;

// Waits between retries. The last one is longer than the one-minute quota window,
// so a rate-limit error is guaranteed to have cleared by the final attempt.
const RETRY_DELAYS_MS = [5_000, 20_000, 65_000];

/**
 * True when Gemini says the DAILY free quota is used up (as opposed to the per-minute limit).
 * Waiting a minute fixes the second, but nothing fixes the first until the quota resets, so
 * retrying only wastes time.
 */
export function isDailyQuotaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /PerDay|per day/i.test(message);
}

export interface Embedder {
  readonly dimensions: number;
  /** Embeds transcript chunks for storage. */
  embedDocuments(texts: string[]): Promise<number[][]>;
  /** Embeds a user question for searching. */
  embedQuery(text: string): Promise<number[]>;
}

/**
 * Gemini embeddings. Documents and questions are embedded with different task types
 * because the model is trained to place a question near the passages that answer it,
 * which is not the same as placing two similar passages near each other.
 */
export class GeminiEmbedder implements Embedder {
  readonly dimensions = EMBEDDING_DIMENSIONS;
  private readonly documentModel: GoogleGenerativeAIEmbeddings;
  private readonly queryModel: GoogleGenerativeAIEmbeddings;
  // When each recent text was sent, used to stay under the per-minute quota.
  private sentAt: number[] = [];

  constructor(apiKey: string | undefined) {
    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY is not set. Add it to .env to create embeddings.');
    }

    const options = {
      apiKey,
      model: EMBEDDING_MODEL,
      outputDimensionality: EMBEDDING_DIMENSIONS,
    };
    this.documentModel = new GoogleGenerativeAIEmbeddings({
      ...options,
      taskType: TaskType.RETRIEVAL_DOCUMENT,
    });
    this.queryModel = new GoogleGenerativeAIEmbeddings({
      ...options,
      taskType: TaskType.RETRIEVAL_QUERY,
    });
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    const vectors: number[][] = [];

    // Small sequential batches keep us under the free tier's rate limits.
    for (let start = 0; start < texts.length; start += BATCH_SIZE) {
      const batch = texts.slice(start, start + BATCH_SIZE);
      await this.waitForQuota(batch.length);
      const batchVectors = await this.withRetry(() => this.documentModel.embedDocuments(batch));
      vectors.push(...batchVectors);
    }

    return vectors;
  }

  async embedQuery(text: string): Promise<number[]> {
    await this.waitForQuota(1);
    return this.withRetry(() => this.queryModel.embedQuery(text));
  }

  // Pauses until sending `count` more texts keeps us under the per-minute quota.
  private async waitForQuota(count: number): Promise<void> {
    for (;;) {
      const now = Date.now();
      this.sentAt = this.sentAt.filter((time) => now - time < WINDOW_MS);

      if (this.sentAt.length + count <= MAX_TEXTS_PER_MINUTE) {
        for (let i = 0; i < count; i++) this.sentAt.push(now);
        return;
      }

      // Wait until the oldest request leaves the one-minute window, then check again.
      const oldest = this.sentAt[0] ?? now;
      await sleep(WINDOW_MS - (now - oldest) + 50);
    }
  }

  // Retries failed calls with growing waits. Every result is validated, because
  // LangChain returns empty vectors instead of throwing when a batch request fails
  // (for example on a 429 rate-limit error), which would silently corrupt the index.
  private async withRetry<T extends number[] | number[][]>(call: () => Promise<T>): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        const result = await call();
        this.assertValid(result);
        return result;
      } catch (error) {
        lastError = error;
        if (isDailyQuotaError(error)) {
          throw new Error(
            'The Gemini daily embedding quota is used up (1000 requests a day on the free tier). ' +
              'It resets once a day, so retrying now will not help. Questions already cached by ' +
              'the eval still work.',
            { cause: error },
          );
        }
        const delay = RETRY_DELAYS_MS[attempt];
        if (delay !== undefined) await sleep(delay);
      }
    }

    throw new Error(
      `Embedding failed after ${RETRY_DELAYS_MS.length + 1} attempts: ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }. Empty vectors usually mean a rate-limit or quota error from Gemini.`,
    );
  }

  private assertValid(result: number[] | number[][]): void {
    const vectors = typeof result[0] === 'number' ? [result as number[]] : (result as number[][]);

    for (const vector of vectors) {
      if (vector.length !== this.dimensions) {
        throw new Error(`Expected a ${this.dimensions}-number vector but got ${vector.length}`);
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
