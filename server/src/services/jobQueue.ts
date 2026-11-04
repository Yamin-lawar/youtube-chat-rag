/**
 * Runs jobs one at a time, in the order they were added, and ignores a job whose key is
 * already waiting. One at a time matters here: ingestion is limited by the embedding
 * quota (about 90 texts a minute), so running two videos in parallel would only make
 * both hit the rate limit.
 */
export class JobQueue {
  private readonly waiting: string[] = [];
  private readonly keys = new Set<string>();
  private running = false;

  constructor(private readonly run: (key: string) => Promise<void>) {}

  /** Adds a job. Does nothing if the same key is already waiting or running. */
  add(key: string): void {
    if (this.keys.has(key)) return;
    this.keys.add(key);
    this.waiting.push(key);
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;

    let key = this.waiting.shift();
    while (key !== undefined) {
      try {
        await this.run(key);
      } catch (error) {
        // `run` should record its own failures. This only stops a bug from killing the queue.
        console.error(`Job ${key} threw`, error);
      }
      this.keys.delete(key);
      key = this.waiting.shift();
    }

    this.running = false;
  }
}
