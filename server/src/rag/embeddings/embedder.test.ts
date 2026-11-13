import { describe, expect, it } from 'vitest';
import { isDailyQuotaError } from './embedder.js';

describe('isDailyQuotaError', () => {
  it('recognises the daily free-tier quota error from Gemini', () => {
    const error = new Error(
      '[429 Too Many Requests] Quota exceeded for metric: embed_content_free_tier_requests, ' +
        'quotaId: EmbedContentRequestsPerDayPerProjectPerModel-FreeTier',
    );
    expect(isDailyQuotaError(error)).toBe(true);
    expect(isDailyQuotaError(new Error('Embed content requests per day limit exceeded'))).toBe(
      true,
    );
  });

  it('does not treat the per-minute limit as a daily one, because waiting fixes that', () => {
    const error = new Error(
      '[429] Quota exceeded: EmbedContentRequestsPerMinutePerProjectPerModel',
    );
    expect(isDailyQuotaError(error)).toBe(false);
  });

  it('is false for other errors and for values that are not errors', () => {
    expect(isDailyQuotaError(new Error('network down'))).toBe(false);
    expect(isDailyQuotaError('something odd')).toBe(false);
    expect(isDailyQuotaError(undefined)).toBe(false);
  });
});
