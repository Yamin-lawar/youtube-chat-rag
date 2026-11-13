import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface CachedAnswer {
  text: string;
  /** Which provider and model wrote it, so a run can say if the answers came from mixed models. */
  model: string;
}

/**
 * The key for an answer: the provider plus the exact system and user prompt sent. The same
 * prompt gives the same key, so asking again costs nothing. Any change to the prompt, the
 * retrieved chunks or their order gives a new key, so a stale answer is never reused.
 */
export function answerKey(provider: string, systemPrompt: string, userPrompt: string): string {
  return createHash('sha256').update(`${provider}\n${systemPrompt}\n${userPrompt}`).digest('hex');
}

/**
 * Remembers generated answers in a file. Free answer models have small daily limits, and the
 * answer eval sends about 3,000 tokens per question, so a run that stops halfway must keep what
 * it has and a repeat run must only pay for what is missing. The temperature is above 0, so
 * a saved answer is also what makes two comparisons use the same sample of the model's output.
 */
export class AnswerCache {
  private entries: Map<string, CachedAnswer> | undefined;

  constructor(private readonly path: string) {}

  async has(key: string): Promise<boolean> {
    return (await this.load()).has(key);
  }

  async get(key: string): Promise<CachedAnswer | undefined> {
    return (await this.load()).get(key);
  }

  /** Saved straight away, so an error on the next question does not lose this one. */
  async set(key: string, answer: CachedAnswer): Promise<void> {
    const entries = await this.load();
    entries.set(key, answer);
    await mkdir(dirname(this.path), { recursive: true });
    // Written to a temporary file and renamed, so an interrupted write cannot leave a broken cache.
    const temporary = `${this.path}.tmp`;
    await writeFile(temporary, JSON.stringify(Object.fromEntries(entries)));
    await rename(temporary, this.path);
  }

  private async load(): Promise<Map<string, CachedAnswer>> {
    if (this.entries) return this.entries;
    try {
      const saved = JSON.parse(await readFile(this.path, 'utf8')) as Record<string, CachedAnswer>;
      this.entries = new Map(Object.entries(saved));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      this.entries = new Map();
    }
    return this.entries;
  }
}
