// How long to wait when a provider says it is overloaded without saying for how long.
const BUSY_WAIT_SECONDS = 30;

export interface RateLimit {
  /** A per-minute limit clears by itself in seconds. A per-day limit will not clear for hours. */
  window: 'minute' | 'day';
  waitSeconds: number;
}

/**
 * Reads a provider's "rate limit reached" error, or its "overloaded, try later" error. Groq's free tier allows only 8,000 tokens a
 * minute for the answer model, so a run of 3,000-token prompts hits it every third question.
 * The error says how long to wait ("Please try again in 10.905s"; Gemini says "retry in").
 * Returns null for any other error, so only errors that clear by waiting are retried and
 * everything else still stops the run.
 */
export function parseRateLimit(message: string): RateLimit | null {
  // A provider that is briefly overloaded (Gemini's 503 "high demand") or a dropped connection
  // clears like a minute limit.
  if (
    /\b503\b|high demand|overloaded|fetch failed|ECONNRESET|ETIMEDOUT/i.test(message) &&
    !/rate limit|429/i.test(message)
  ) {
    return { window: 'minute', waitSeconds: BUSY_WAIT_SECONDS };
  }
  if (!/rate limit|429/i.test(message)) return null;

  const window = /per\s?day|\(TPD\)|\(RPD\)/i.test(message) ? 'day' : 'minute';
  const wait = /(?:try again|retry) in (?:(\d+)h)?(?:(\d+)m(?!s))?(?:([\d.]+)s)?/i.exec(message);
  const [, hours, minutes, seconds] = wait ?? [];
  const waitSeconds =
    Number(hours ?? 0) * 3600 + Number(minutes ?? 0) * 60 + Number(seconds ?? 0) || 30;

  return { window, waitSeconds };
}
