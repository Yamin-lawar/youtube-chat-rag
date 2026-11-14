import { parseRateLimit } from './rateLimit.js';

export interface RetryOptions {
  /** How many waits to allow before giving up and throwing the error. */
  maxWaits?: number;
  log?: (message: string) => void;
  /** Replaceable so tests do not really wait. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Runs `attempt`. A per-minute limit or a short overload is waited out and tried again, anything
 * else (a daily limit, a bad key) is thrown at once, because waiting a minute will not fix it.
 */
export async function retryOnLimit<T>(
  attempt: () => Promise<T>,
  {
    maxWaits = 8,
    log = console.log,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  }: RetryOptions = {},
): Promise<T> {
  for (let waits = 0; ; waits++) {
    try {
      return await attempt();
    } catch (error) {
      const limit = parseRateLimit(error instanceof Error ? error.message : String(error));
      if (limit?.window !== 'minute' || waits >= maxWaits) throw error;
      const seconds = Math.ceil(limit.waitSeconds) + 1;
      log(`  provider busy or rate limited (per minute), waiting ${seconds}s`);
      await sleep(seconds * 1000);
    }
  }
}
