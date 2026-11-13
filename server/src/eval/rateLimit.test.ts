import { describe, expect, it } from 'vitest';
import { parseRateLimit } from './rateLimit.js';

describe('parseRateLimit', () => {
  it('reads a per-minute limit and how long to wait', () => {
    const message =
      '429 Rate limit reached for model `openai/gpt-oss-120b` on tokens per minute (TPM): Limit 8000, Used 6208, Requested 3246. Please try again in 10.905s.';
    expect(parseRateLimit(message)).toEqual({ window: 'minute', waitSeconds: 10.905 });
  });

  it('reads a per-day limit with minutes and seconds', () => {
    const message =
      '429 Rate limit reached on tokens per day (TPD): Limit 200000. Please try again in 23m4.8s.';
    expect(parseRateLimit(message)).toEqual({ window: 'day', waitSeconds: 23 * 60 + 4.8 });
  });

  it('reads hours', () => {
    const message = 'Rate limit reached on requests per day (RPD). Please try again in 2h3m10s.';
    expect(parseRateLimit(message)?.waitSeconds).toBe(2 * 3600 + 3 * 60 + 10);
  });

  it('reads a wait given in milliseconds as a short wait, not as minutes', () => {
    const message = 'Rate limit reached on tokens per minute (TPM). Please try again in 500ms.';
    expect(parseRateLimit(message)?.window).toBe('minute');
    expect(parseRateLimit(message)?.waitSeconds).toBeLessThan(60);
  });

  it('reads the wording Gemini uses', () => {
    const minute = 'RESOURCE_EXHAUSTED 429: quota exceeded for PerMinute. Please retry in 36.2s.';
    expect(parseRateLimit(minute)).toEqual({ window: 'minute', waitSeconds: 36.2 });
    const day =
      '429 You exceeded your current quota: GenerateRequestsPerDayPerProjectPerModel. Please retry in 5h.';
    expect(parseRateLimit(day)).toEqual({ window: 'day', waitSeconds: 5 * 3600 });
  });

  it('falls back to 30 seconds when the error gives no wait time', () => {
    expect(parseRateLimit('429 Too Many Requests')).toEqual({ window: 'minute', waitSeconds: 30 });
  });

  it('treats a briefly overloaded provider as a short wait', () => {
    const message = '[503 Service Unavailable] This model is currently experiencing high demand.';
    expect(parseRateLimit(message)).toEqual({ window: 'minute', waitSeconds: 30 });
  });

  it('treats a dropped connection as a short wait', () => {
    expect(
      parseRateLimit('Error fetching from https://example.com: fetch failed')?.waitSeconds,
    ).toBe(30);
  });

  it('returns null for errors that are not rate limits', () => {
    expect(parseRateLimit('401 Unauthorized: bad API key')).toBeNull();
    expect(parseRateLimit('All generators failed.')).toBeNull();
  });
});
